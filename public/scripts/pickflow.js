/* ============================================================
   PICK-TURN flowing texture — WebGL. Works on both banpick and the
   LED page (adapts to the card size + its background framing).

   One shared WebGL canvas renders the Vector-pick streaks with a
   smooth, perfectly-looping DIAGONAL flow: the streaks stay put and a
   looping displacement field (sine waves whose time terms are integer
   multiples of one 2π period → seamless loop) sweeps down-left along the
   "/" streaks. Each frame the result is copied into every card's own
   <canvas class="card-flow"> — the flow runs on all cards at once; CSS greys the
   ones whose turn it isn't (like a ban) and lights up the active card in colour.

   The texture UV is framed to match the card's static background
   (read from the CSS var --flow-cover = the "auto NNN%" factor) so the
   flow lines up with a non-picking card and fills it fully.
   ============================================================ */
(function () {
  // Two streak textures, one per team. RIGHT keeps the purple Vector-pick over a
  // deep-purple background; LEFT uses the gold "Vector pick 2" over gold #fffbc7.
  // Each side gets its own render pass (own texture, bg colour + cover framing).
  const TEX = {
    left:  { url: "/assets/ui/vector-pick-2.png", ar: 301 / 360, bg: [1.0, 0.984, 0.780], cover: [1.58, 1.65] }, // #fffbc7 gold
    right: { url: "/assets/ui/vector-pick.png",   ar: 301 / 406, bg: [0.172, 0.051, 0.329], cover: [1.58, 1.65] }, // ≈ --purple-deep #2c0d54
  };
  const MAXSIDE = 1000; // cap the render buffer's longest side (higher = sharper flow)
  let gl, glCanvas, uTimeLoc, uCoverLoc, uAspLoc, uBgLoc;
  let CW = 310, CH = 472, cardAR = 155 / 236;
  const startT = performance.now();

  function firstCard() {
    for (let n = 1; n <= 10; n++) {
      const box = document.getElementById("image-box-" + n);
      const card = box && box.closest(".heropick");
      if (card) return card;
    }
    return null;
  }

  function measure() {
    const card = firstCard();
    if (!card) return;
    const w = card.offsetWidth || 155;
    const h = card.offsetHeight || 236;
    cardAR = w / h;
    // render buffer at ~2.5x the card, capped (higher = sharper flow)
    let bw = w * 2.5, bh = h * 2.5;
    const m = Math.max(bw, bh);
    if (m > MAXSIDE) { const k = MAXSIDE / m; bw *= k; bh *= k; }
    CW = Math.max(2, Math.round(bw));
    CH = Math.max(2, Math.round(bh));
    // framing: auto NNN% → texture covers coverH of card height, coverW of width
    const fc = parseFloat(getComputedStyle(card).getPropertyValue("--flow-cover")) || 1.4;
    const coverH = fc;
    // each texture has its own aspect, so frame each side to match its static bg
    TEX.left.cover = [fc * TEX.left.ar / cardAR, coverH];
    TEX.right.cover = [fc * TEX.right.ar / cardAR, coverH];
  }

  function ensureCanvases() {
    for (let n = 1; n <= 10; n++) {
      const box = document.getElementById("image-box-" + n);
      const card = box && box.closest(".heropick");
      if (!card) continue;
      let cv = card.querySelector(":scope > canvas.card-flow");
      if (!cv) {
        cv = document.createElement("canvas");
        cv.className = "card-flow";
        card.insertBefore(cv, card.firstChild);
      }
      cv.width = CW;
      cv.height = CH;
      cv.dataset.side = n <= 5 ? "left" : "right"; // cards 1..5 = left team, 6..10 = right
    }
  }

  function compile(type, src) {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) console.error("[pickflow]", gl.getShaderInfoLog(s));
    return s;
  }
  function link(vs, fs) {
    const p = gl.createProgram();
    gl.attachShader(p, compile(gl.VERTEX_SHADER, vs));
    gl.attachShader(p, compile(gl.FRAGMENT_SHADER, fs));
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) console.error("[pickflow]", gl.getProgramInfoLog(p));
    return p;
  }

  function initGL() {
    glCanvas = document.createElement("canvas");
    glCanvas.width = CW;
    glCanvas.height = CH;
    gl = glCanvas.getContext("webgl", { alpha: false, premultipliedAlpha: false, antialias: true, preserveDrawingBuffer: true });
    if (!gl) return false;

    const vs = `attribute vec2 p; varying vec2 vUv;
      void main(){ vUv = vec2((p.x+1.0)*0.5, 1.0-(p.y+1.0)*0.5); gl_Position = vec4(p,0.0,1.0); }`;
    const fs = `precision mediump float;
      varying vec2 vUv; uniform sampler2D uTex; uniform float uTime;
      uniform vec2 uCover; uniform float uAsp; uniform vec3 uBg;
      const float LOOP = 3.4; // seconds per seamless loop (lower = faster motion)
      void main(){
        vec2 fd = normalize(vec2(-0.66, 0.75)); // flow dir: down-left along the "/" streaks
        vec2 pe = vec2(-fd.y, fd.x);
        vec2 pUv = vec2(vUv.x * uAsp, vUv.y);   // proportional space so the diagonal is screen-true
        float s = dot(pUv, fd);
        float q = dot(pUv, pe);
        float T = 6.2831853 * uTime / LOOP;
        float w  = 0.60*sin(s*22.0 + q*6.0 - 1.0*T)
                 + 0.30*sin(s*38.0 - q*4.0 - 2.0*T + 1.7)
                 + 0.18*sin(s*61.0 + q*9.0 - 3.0*T + 3.1);
        float w2 = 0.55*cos(s*26.0 - q*5.0 - 1.0*T + 0.6)
                 + 0.28*cos(s*44.0 + q*7.0 - 2.0*T + 2.3);
        vec2 disp = (fd*w + pe*w2) * 0.02;
        vec2 uv = (vUv - 0.5) / uCover + 0.5;    // match the static card framing
        vec4 t = texture2D(uTex, clamp(uv + disp, 0.0, 1.0));
        gl_FragColor = vec4(mix(uBg, t.rgb, t.a), 1.0); // bg colour per team (uBg)
      }`;

    const prog = link(vs, fs);
    gl.useProgram(prog);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, "p");
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    uTimeLoc = gl.getUniformLocation(prog, "uTime");
    uCoverLoc = gl.getUniformLocation(prog, "uCover");
    uAspLoc = gl.getUniformLocation(prog, "uAsp");
    uBgLoc = gl.getUniformLocation(prog, "uBg");
    gl.uniform1i(gl.getUniformLocation(prog, "uTex"), 0);

    // one texture per team; each starts as a 1x1 transparent placeholder until
    // its image loads, then flips its own .ready flag.
    function makeTex(spec) {
      const tex = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0, 0, 0, 0]));
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      const img = new Image();
      img.onload = () => {
        gl.bindTexture(gl.TEXTURE_2D, tex);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
        spec.ready = true;
      };
      img.src = spec.url;
      spec.tex = tex;
      spec.ready = false;
    }
    makeTex(TEX.left);
    makeTex(TEX.right);
    return true;
  }

  function frame() {
    // The flow runs on EVERY card, not just the one whose turn it is — non-turn
    // cards are greyed (like a ban) purely in CSS; the animation never stands
    // still. One WebGL pass per team (own texture + bg colour), each copied into
    // that side's card canvases: LEFT = gold streaks on #fffbc7, RIGHT = purple.
    const flows = document.querySelectorAll(".heropick canvas.card-flow");
    if (flows.length && (TEX.left.ready || TEX.right.ready)) {
      if (glCanvas.width !== CW || glCanvas.height !== CH) { glCanvas.width = CW; glCanvas.height = CH; }
      gl.viewport(0, 0, CW, CH);
      gl.uniform1f(uAspLoc, cardAR);
      gl.uniform1f(uTimeLoc, (performance.now() - startT) / 1000);
      for (const side of ["left", "right"]) {
        const spec = TEX[side];
        if (!spec.ready) continue;
        gl.bindTexture(gl.TEXTURE_2D, spec.tex);
        gl.uniform2f(uCoverLoc, spec.cover[0], spec.cover[1]);
        gl.uniform3f(uBgLoc, spec.bg[0], spec.bg[1], spec.bg[2]);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
        flows.forEach((cv) => {
          if (cv.dataset.side !== side) return;
          if (cv.width !== CW || cv.height !== CH) { cv.width = CW; cv.height = CH; }
          const c = cv.getContext("2d");
          c.clearRect(0, 0, CW, CH);
          c.drawImage(glCanvas, 0, 0, CW, CH);
        });
      }
    }
    requestAnimationFrame(frame);
  }

  function start() {
    measure();
    ensureCanvases();
    if (initGL()) requestAnimationFrame(frame);
    // re-measure on resize (card size can change with the stage scale layout)
    let t;
    window.addEventListener("resize", () => { clearTimeout(t); t = setTimeout(measure, 200); });
  }
  if (document.readyState !== "loading") start();
  else document.addEventListener("DOMContentLoaded", start);
})();
