const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const script = new vm.Script(html.match(/<script>([\s\S]*?)<\/script>/)[1]);

async function boot({ missing = () => false, blocked = false, stalled = () => false, failCrop = false } = {}) {
  const elements = new Map();
  const frames = [];
  const pending = new Map();
  const draws = [];
  const sprites = [];
  const storage = new Map();
  const ctx = {
    drawImage(image, ...args) { assert.ok(image.width || image.naturalWidth); sprites.push({ file: image.file, args }); },
    getImageData() {
      if (failCrop) throw new Error('Canvas read blocked');
      return { data: new Uint8Array([0, 0, 0, 255]) };
    },
    fillText(text) { draws.push(text); },
    fillRect() {}, beginPath() {}, moveTo() {}, lineTo() {}, stroke() {}
  };
  function element() {
    return { hidden: false, handlers: {}, getContext: () => ctx,
      addEventListener(type, fn) { this.handlers[type] = fn; } };
  }
  const document = Object.assign(element(), {
    createElement: element,
    getElementById(id) {
      if (!elements.has(id)) elements.set(id, element());
      return elements.get(id);
    }
  });
  const c = vm.createContext({
    document,
    Image: class {
      set src(file) {
        this.file = file;
        queueMicrotask(() => {
          if (stalled(file)) return;
          if (missing(file)) return this.onerror?.();
          const data = fs.readFileSync(path.join(root, file));
          this.naturalWidth = data.readUInt32BE(16);
          this.naturalHeight = data.readUInt32BE(20);
          this.onload?.();
        });
      }
    },
    Audio: class {
      constructor(file) { assert.ok(fs.existsSync(path.join(root, file)), file); }
      cloneNode() { return this; }
      play() { return Promise.resolve(); }
    },
    localStorage: {
      getItem(key) { if (blocked) throw Error('blocked'); return storage.get(key) ?? null; },
      setItem(key, value) { if (blocked) throw Error('blocked'); storage.set(key, value); }
    },
    setTimeout(fn) { const id = Symbol(); pending.set(id, fn); return id; },
    clearTimeout(id) { pending.delete(id); },
    requestAnimationFrame(fn) { frames.push(fn); }
  });
  script.runInContext(c);
  const settle = () => new Promise(resolve => setImmediate(resolve));
  await settle();
  return { e: js => vm.runInContext(js, c), frames, elements, draws, sprites, pending, storage, settle,
    key: code => document.handlers.keydown({ code, preventDefault() {} }) };
}

test('normal boot, start, collision, persistent high score and restart', async () => {
  const { e, frames, key, storage } = await boot();
  assert.equal(e('ready'), true);
  assert.equal(frames.length, 1);
  frames.shift()(16.67);
  key('Space');
  e("score = 42.9; spawnObstacleAt(player.x, 'ground1'); update(16.67)");
  assert.equal(e('state'), 2);
  assert.equal(storage.get('xiaoke_highscore'), '42');
  key('Space');
  assert.equal(e('state === STATE.PLAY && player.y === 0 && obstacles.length === 0'), true);
});

test('missing optional graphics, blocked canvas reads and blocked storage do not interrupt play', async () => {
  const game = await boot({ blocked: true, failCrop: true,
    missing: file => file.startsWith('Background/') || ['frames/frame_0001.png', 'stand.png', 'obstacles/ground1.png'].includes(file) });
  const { e, frames, draws, key } = game;
  assert.equal(e('ready && runFrames.every(Boolean)'), true);
  assert.equal(frames.length, 1);
  frames.shift()(16.67);
  assert.ok(draws.includes('鲨克快跑'));
  key('Space');
  e("player.ducking = true; spawnObstacleAt(500, 'ground1'); draw(16.67)");
  e("player.ducking = false; score = 84.9; spawnObstacleAt(player.x, 'ground1'); update(16.67); draw(16.67)");
  assert.ok(draws.includes('GAME OVER'));
  assert.equal(e('highScore'), 84);
  key('Space');
  assert.equal(e('highScore'), 84);
});

test('down key draws the slide sprite in both poses even when canvas pixel reads are blocked', async () => {
  const { e, sprites, key } = await boot({ failCrop: true });
  key('Space');
  key('ArrowDown');
  e('drawPlayer()');
  assert.equal(sprites.at(-1).file, 'slide.png');
  assert.deepEqual(sprites.at(-1).args.slice(0, 4), [159, 209, 309, 193]);
  key('Space');
  key('ArrowDown');
  assert.equal(e('player.fastFall'), true);
  e('drawPlayer()');
  assert.equal(sprites.at(-1).file, 'slide.png');
});

test('missing slide sprite uses a shark frame instead of a solid rectangle', async () => {
  const { e, key, sprites } = await boot({ missing: file => file === 'slide.png' });
  key('Space');
  key('ArrowDown');
  e('drawPlayer()');
  assert.match(sprites.at(-1).file, /^frames\//);
  assert.equal(sprites.at(-1).args[3], e('slideDrawH'));
});

test('critical image timeout shows retry; retry starts exactly one render loop', async () => {
  let interrupted = true;
  const { e, elements, pending, frames, settle, key } = await boot({ stalled: file => interrupted && file.startsWith('frames/') });
  assert.equal(pending.size, 18);
  key('Space');
  assert.equal(e('state'), 0);
  for (const timeout of pending.values()) timeout();
  await settle();
  const button = elements.get('retry-load');
  assert.equal(button.hidden, false);
  assert.match(elements.get('load-status').textContent, /无法启动游戏/);
  assert.equal(frames.length, 0);
  interrupted = false;
  await Promise.all([button.handlers.click(), button.handlers.click()]);
  assert.equal(button.hidden, true);
  assert.equal(e('ready'), true);
  assert.equal(frames.length, 1);
  frames.shift()(16.67);
  assert.equal(frames.length, 1);
});

test('obstacle queue stays bounded over 180 seconds; generated pairs have a safe jump window', async () => {
  const { e } = await boot();
  for (const random of [0.1, 0.5, 0.9]) {
    const result = e(`(() => {
      resetGame(); state = STATE.PLAY; Math.random = () => ${random};
      const originalOverlap = rectsOverlap;
      rectsOverlap = () => false;
      let peak = 0, pairs = 0, passes = 0, invalidPairs = 0;
      let seen = new WeakSet();
      for (let i = 0; i < 10800; i++) {
        update(1000 / 60);
        peak = Math.max(peak, obstacles.length);
        for (let j = 0; j < obstacles.length; j++) {
          const first = obstacles[j], second = obstacles[j + 1];
          if (!seen.has(first) && first.x < W && first.x > 0) { seen.add(first); passes++; }
          if (second && second.x - first.x - first.w < 8) {
            pairs++;
            if (!canJumpOverPair(first, second)) invalidPairs++;
          }
        }
      }
      rectsOverlap = originalOverlap;
      return { peak, pairs, passes, invalidPairs };
    })()`);
    assert.ok(result.peak <= 8, JSON.stringify(result));
    assert.ok(result.passes > 70, JSON.stringify(result));
    assert.equal(result.invalidPairs, 0);
    if (random === 0.1) assert.ok(result.pairs > 0);
  }
  assert.equal(e(`speed = BASE_SPEED; canJumpOverPair({ x: 0, h: 54 }, { x: 500, w: 60, h: 52 })`), false);
});

test('a wide ground pair at base speed can be cleared by one jump at 30, 60 and 144 Hz', async () => {
  const { e } = await boot();
  for (const dt of [33, 1000 / 60, 1000 / 144]) {
    assert.equal(e(`(() => {
      const dt = ${dt};
      refillObstacles = () => {};
      for (let lead = 0; lead <= 180; lead++) {
        resetGame(); state = STATE.PLAY;
        const first = { x: player.x + playerDrawW - HITBOX_MARGIN + lead, w: 60, h: 52 };
        const second = { x: first.x + 67, w: 60, h: 52 };
        first.y = second.y = groundY - first.h;
        obstacles = [first, second];
        player.vy = JUMP_FORCE; player.grounded = false;
        for (let i = 0; i < Math.ceil(1000 / dt) && state === STATE.PLAY; i++) update(dt);
        if (state === STATE.PLAY && second.x + second.w < player.x) return true;
      }
      return false;
    })()`), true, `dt=${dt}`);
  }
});
