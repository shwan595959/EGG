"use strict";

(() => {
  const canvas = document.getElementById("starfield");

  if (!canvas) return;

  const ctx = canvas.getContext("2d");

  if (!ctx) return;

  const SETTINGS = {
    // 별 개수
    desktopStars: 200,
    mobileStars: 90,

    // 회전 중심: 화면 너비·높이에 대한 비율
    centerX: 0.83,
    centerY: 0.2,

    // 초당 회전 각도, 라디안
    // 값이 클수록 빠르게 움직입니다.
    rotationSpeed: 0.05,

    // 궤적 길이, 라디안
    minTrail: 0.035,
    maxTrail: 0.22,

    // 배경 별 밝기
    brightness: 0.9,

    // 궤적을 여러 조각으로 나누어 끝을 부드럽게 표시
    trailSegments: 8,

    // 고해상도 화면의 과도한 렌더링 방지
    maxPixelRatio: 1.5,

    // 최대 초당 프레임
    maxFPS: 30,
  };

  const reducedMotion = window.matchMedia(
    "(prefers-reduced-motion: reduce)"
  );

  let width = 0;
  let height = 0;

  let centerX = 0;
  let centerY = 0;

  let stars = [];
  let rotation = 0;

  let animationId = null;
  let lastTime = null;

  function random(min, max) {
    return min + Math.random() * (max - min);
  }

  function createStars() {
    const count = width < 640
      ? SETTINGS.mobileStars
      : SETTINGS.desktopStars;

    const maxRadius = Math.max(
      Math.hypot(centerX, centerY),
      Math.hypot(width - centerX, centerY),
      Math.hypot(centerX, height - centerY),
      Math.hypot(width - centerX, height - centerY)
    ) + 40;

    stars = Array.from({ length: count }, () => {
      // 平面的に偏りにくいよう半径を分布
      const radius = Math.sqrt(Math.random()) * maxRadius;

      return {
        radius,
        angle: random(0, Math.PI * 2),

        size: random(0.45, 1.25),
        opacity: random(0.22, 0.85),

        trail: random(
          SETTINGS.minTrail,
          SETTINGS.maxTrail
        ),

        warm: Math.random() > 0.88,
      };
    });
  }

  function resize() {
    width = window.innerWidth;
    height = window.innerHeight;

    const pixelRatio = Math.min(
      window.devicePixelRatio || 1,
      SETTINGS.maxPixelRatio
    );

    canvas.width = Math.round(width * pixelRatio);
    canvas.height = Math.round(height * pixelRatio);

    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;

    ctx.setTransform(
      pixelRatio,
      0,
      0,
      pixelRatio,
      0,
      0
    );

    centerX = width * SETTINGS.centerX;
    centerY = height * SETTINGS.centerY;

    createStars();
    draw();
  }

  function drawBackground() {
    ctx.clearRect(0, 0, width, height);

    // 회전 중심 주변의 은은한 빛
    const halo = ctx.createRadialGradient(
      centerX,
      centerY,
      0,
      centerX,
      centerY,
      Math.max(width, height) * 0.75
    );

    halo.addColorStop(0, "rgba(43, 62, 106, 0.15)");
    halo.addColorStop(0.45, "rgba(24, 36, 67, 0.07)");
    halo.addColorStop(1, "rgba(7, 9, 16, 0)");

    ctx.fillStyle = halo;
    ctx.fillRect(0, 0, width, height);
  }

  function drawStar(star) {
    const angle = star.angle + rotation;

    const color = star.warm
      ? "238, 220, 201"
      : "185, 209, 246";

    const opacity =
      star.opacity * SETTINGS.brightness;

    // 궤적의 뒤쪽은 어둡고, 별에 가까워질수록 밝게 표시
    for (
      let i = 0;
      i < SETTINGS.trailSegments;
      i++
    ) {
      const start =
        angle -
        star.trail +
        (star.trail * i) / SETTINGS.trailSegments;

      const end =
        angle -
        star.trail +
        (star.trail * (i + 1)) /
          SETTINGS.trailSegments;

      const strength =
        (i + 1) / SETTINGS.trailSegments;

      ctx.beginPath();

      ctx.arc(
        centerX,
        centerY,
        star.radius,
        start,
        end
      );

      ctx.lineWidth = star.size * 0.65;
      ctx.strokeStyle =
        `rgba(${color}, ${opacity * strength * 0.42})`;

      ctx.stroke();
    }

    // 현재 별 위치
    const x =
      centerX + Math.cos(angle) * star.radius;

    const y =
      centerY + Math.sin(angle) * star.radius;

    // 화면 밖의 별 본체는 그리지 않음
    if (
      x < -5 ||
      x > width + 5 ||
      y < -5 ||
      y > height + 5
    ) {
      return;
    }

    ctx.beginPath();

    ctx.arc(
      x,
      y,
      star.size,
      0,
      Math.PI * 2
    );

    ctx.fillStyle = `rgba(${color}, ${opacity})`;
    ctx.fill();
  }

  function drawPoleStar() {
    // 회전 중심을 나타내는 작은 별
    ctx.beginPath();

    ctx.arc(
      centerX,
      centerY,
      1.3,
      0,
      Math.PI * 2
    );

    ctx.fillStyle = "rgba(220, 232, 255, 0.7)";
    ctx.fill();

    ctx.beginPath();

    ctx.arc(
      centerX,
      centerY,
      5,
      0,
      Math.PI * 2
    );

    ctx.fillStyle = "rgba(190, 211, 255, 0.04)";
    ctx.fill();
  }

  function draw() {
    drawBackground();

    ctx.lineCap = "round";

    for (const star of stars) {
      drawStar(star);
    }

    drawPoleStar();
  }

  function animate(time) {
    animationId = null;

    if (document.hidden || reducedMotion.matches) {
      lastTime = null;
      return;
    }

    if (lastTime === null) {
      lastTime = time;
    }

    const elapsed = time - lastTime;
    const frameInterval = 1000 / SETTINGS.maxFPS;

    if (elapsed >= frameInterval) {
      // 탭 복귀 등으로 갑자기 크게 회전하는 현상 방지
      const deltaSeconds = Math.min(elapsed / 1000, 0.1);

      rotation = (
        rotation +
        SETTINGS.rotationSpeed * deltaSeconds
      ) % (Math.PI * 2);

      lastTime = time;
      draw();
    }

    animationId = requestAnimationFrame(animate);
  }

  function stopAnimation() {
    if (animationId !== null) {
      cancelAnimationFrame(animationId);
      animationId = null;
    }

    lastTime = null;
  }

  function startAnimation() {
    stopAnimation();

    // 동작 줄이기 설정이 있으면 정지된 궤적만 표시
    draw();

    if (!document.hidden && !reducedMotion.matches) {
      animationId = requestAnimationFrame(animate);
    }
  }

  let resizeTimer;

  window.addEventListener("resize", () => {
    clearTimeout(resizeTimer);

    resizeTimer = setTimeout(resize, 120);
  });

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      stopAnimation();
    } else {
      startAnimation();
    }
  });

  reducedMotion.addEventListener("change", startAnimation);

  resize();
  startAnimation();
})();
