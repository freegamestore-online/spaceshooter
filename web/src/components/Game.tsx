import { useRef, useEffect } from "react";
import { useGameSounds } from "@freegamestore/games";
import Phaser from "phaser";

interface GameProps {
  onScore: (score: number) => void;
  onGameOver: () => void;
  onLives: (lives: number) => void;
  paused?: boolean;
}

const PLAYER_SPEED = 300;
const BULLET_SPEED = 500;
const FIRE_RATE = 200; // ms between shots
const ENEMY_BASE_SPEED = 100;
const ENEMY_MAX_SPEED = 300;
const ENEMY_SPEED_RAMP = 2; // speed increase per second
const ENEMY_SPAWN_BASE = 1000; // ms
const ENEMY_SPAWN_MIN = 300;
const STAR_COUNT = 80;
const PLAYER_LIVES = 3;
const INVINCIBLE_DURATION = 1500;

class ShooterScene extends Phaser.Scene {
  private player!: Phaser.Physics.Arcade.Sprite;
  private bullets!: Phaser.Physics.Arcade.Group;
  private enemies!: Phaser.Physics.Arcade.Group;
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private wasd!: { up: Phaser.Input.Keyboard.Key; down: Phaser.Input.Keyboard.Key; left: Phaser.Input.Keyboard.Key; right: Phaser.Input.Keyboard.Key };
  private spaceKey!: Phaser.Input.Keyboard.Key;
  private lastFired = 0;
  private score = 0;
  private lives = PLAYER_LIVES;
  private elapsedTime = 0;
  private spawnTimer = 0;
  private invincibleUntil = 0;
  private touchMoving = false;
  private touchTargetX = 0;
  private touchTargetY = 0;
  private gameOver = false;

  constructor() {
    super("ShooterScene");
  }

  create() {
    const { width, height } = this.scale;

    // --- Generate textures with graphics ---
    // Player ship (triangle pointing up)
    const pg = this.make.graphics({ x: 0, y: 0 });
    pg.fillStyle(0x2563eb);
    pg.fillTriangle(16, 0, 0, 32, 32, 32);
    pg.fillStyle(0x60a5fa);
    pg.fillTriangle(16, 6, 6, 28, 26, 28);
    pg.generateTexture("player", 32, 32);
    pg.destroy();

    // Bullet
    const bg = this.make.graphics({ x: 0, y: 0 });
    bg.fillStyle(0xfbbf24);
    bg.fillCircle(3, 3, 3);
    bg.generateTexture("bullet", 6, 6);
    bg.destroy();

    // Enemy ship (triangle pointing down)
    const eg = this.make.graphics({ x: 0, y: 0 });
    eg.fillStyle(0xef4444);
    eg.fillTriangle(14, 28, 0, 0, 28, 0);
    eg.fillStyle(0xfca5a5);
    eg.fillTriangle(14, 22, 5, 4, 23, 4);
    eg.generateTexture("enemy", 28, 28);
    eg.destroy();

    // Star
    const sg = this.make.graphics({ x: 0, y: 0 });
    sg.fillStyle(0xffffff);
    sg.fillCircle(1, 1, 1);
    sg.generateTexture("star", 2, 2);
    sg.destroy();

    // --- Background stars ---
    for (let i = 0; i < STAR_COUNT; i++) {
      const star = this.add.image(
        Phaser.Math.Between(0, width),
        Phaser.Math.Between(0, height),
        "star",
      );
      star.setAlpha(Phaser.Math.FloatBetween(0.2, 0.8));
      star.setData("speed", Phaser.Math.Between(20, 80));
    }

    // --- Player ---
    this.player = this.physics.add.sprite(width / 2, height - 60, "player");
    this.player.setCollideWorldBounds(true);
    this.player.setDepth(10);

    // --- Groups ---
    this.bullets = this.physics.add.group({
      defaultKey: "bullet",
      maxSize: 30,
    });

    this.enemies = this.physics.add.group({
      defaultKey: "enemy",
    });

    // --- Collision: bullet hits enemy ---
    this.physics.add.overlap(
      this.bullets,
      this.enemies,
      (_bulletObj, _enemyObj) => {
        const bullet = _bulletObj as Phaser.Physics.Arcade.Sprite;
        const enemy = _enemyObj as Phaser.Physics.Arcade.Sprite;
        bullet.disableBody(true, true);
        enemy.disableBody(true, true);
        this.score += 10;
        this.events.emit("score", this.score);

        // Small explosion particles
        for (let i = 0; i < 6; i++) {
          const p = this.add.circle(
            enemy.x + Phaser.Math.Between(-10, 10),
            enemy.y + Phaser.Math.Between(-10, 10),
            Phaser.Math.Between(2, 5),
            0xfbbf24,
          );
          this.tweens.add({
            targets: p,
            alpha: 0,
            scale: 0,
            duration: 300,
            onComplete: () => p.destroy(),
          });
        }
      },
      undefined,
      this,
    );

    // --- Collision: enemy hits player ---
    this.physics.add.overlap(
      this.player,
      this.enemies,
      (_playerObj, _enemyObj) => {
        if (this.gameOver) return;
        const now = this.time.now;
        if (now < this.invincibleUntil) return;

        const enemy = _enemyObj as Phaser.Physics.Arcade.Sprite;
        enemy.disableBody(true, true);
        this.lives--;
        this.updateLivesText();

        if (this.lives <= 0) {
          this.gameOver = true;
          this.player.disableBody(true, true);
          this.events.emit("gameover");
        } else {
          // Brief invincibility + flash
          this.invincibleUntil = now + INVINCIBLE_DURATION;
          this.tweens.add({
            targets: this.player,
            alpha: 0.3,
            yoyo: true,
            repeat: 5,
            duration: 100,
            onComplete: () => {
              if (this.player.active) this.player.setAlpha(1);
            },
          });
        }
      },
      undefined,
      this,
    );

    // --- Input ---
    if (this.input.keyboard) {
      this.cursors = this.input.keyboard.createCursorKeys();
      this.wasd = {
        up: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.W),
        down: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.S),
        left: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.A),
        right: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.D),
      };
      this.spaceKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);
    }

    // --- Touch input ---
    this.input.on("pointerdown", (pointer: Phaser.Input.Pointer) => {
      this.touchMoving = true;
      this.touchTargetX = pointer.x;
      this.touchTargetY = pointer.y;
    });
    this.input.on("pointermove", (pointer: Phaser.Input.Pointer) => {
      if (pointer.isDown) {
        this.touchMoving = true;
        this.touchTargetX = pointer.x;
        this.touchTargetY = pointer.y;
      }
    });
    this.input.on("pointerup", () => {
      this.touchMoving = false;
    });

    // --- Lives display ---
    this.livesText = this.add.text(10, 10, "", {
      fontSize: "14px",
      color: "#ef4444",
    }).setDepth(20);
    this.updateLivesText();

    // --- Set background ---
    this.cameras.main.setBackgroundColor(0x0a0a1a);

    // --- Handle resize ---
    this.scale.on("resize", (gameSize: Phaser.Structs.Size) => {
      this.cameras.main.setViewport(0, 0, gameSize.width, gameSize.height);
    });
  }

  private updateLivesText() {
    const hearts = Array.from({ length: this.lives }, () => "♥").join(" ");
    this.livesText.setText(hearts);
  }

  private fireBullet() {
    const now = this.time.now;
    if (now - this.lastFired < FIRE_RATE) return;
    this.lastFired = now;

    const bullet = this.bullets.get(
      this.player.x,
      this.player.y - 20,
    ) as Phaser.Physics.Arcade.Sprite | null;
    if (!bullet) return;
    bullet.enableBody(true, this.player.x, this.player.y - 20, true, true);
    bullet.setVelocityY(-BULLET_SPEED);
  }

  private spawnEnemy() {
    const { width } = this.scale;
    const x = Phaser.Math.Between(20, width - 20);
    const enemy = this.enemies.create(x, -20, "enemy") as Phaser.Physics.Arcade.Sprite;
    const currentSpeed = Math.min(
      ENEMY_MAX_SPEED,
      ENEMY_BASE_SPEED + this.elapsedTime * ENEMY_SPEED_RAMP,
    );
    enemy.setVelocityY(currentSpeed + Phaser.Math.Between(-20, 20));
    // Slight horizontal drift
    enemy.setVelocityX(Phaser.Math.Between(-40, 40));
  }

  update(_time: number, delta: number) {
    if (this.gameOver) return;

    const dt = delta / 1000;
    this.elapsedTime += dt;

    // --- Move background stars ---
    this.children.getAll().forEach((child) => {
      if (child.getData("speed")) {
        const star = child as Phaser.GameObjects.Image;
        star.y += star.getData("speed") as number * dt;
        if (star.y > this.scale.height) {
          star.y = 0;
          star.x = Phaser.Math.Between(0, this.scale.width);
        }
      }
    });

    // --- Player movement ---
    const body = this.player.body as Phaser.Physics.Arcade.Body;
    body.setVelocity(0);

    let moveLeft = false;
    let moveRight = false;
    let moveUp = false;
    let moveDown = false;
    let firing = false;

    if (this.cursors) {
      moveLeft = this.cursors.left.isDown || this.wasd.left.isDown;
      moveRight = this.cursors.right.isDown || this.wasd.right.isDown;
      moveUp = this.cursors.up.isDown || this.wasd.up.isDown;
      moveDown = this.cursors.down.isDown || this.wasd.down.isDown;
      firing = this.spaceKey.isDown;
    }

    if (moveLeft) body.setVelocityX(-PLAYER_SPEED);
    else if (moveRight) body.setVelocityX(PLAYER_SPEED);

    if (moveUp) body.setVelocityY(-PLAYER_SPEED);
    else if (moveDown) body.setVelocityY(PLAYER_SPEED);

    // Touch movement
    if (this.touchMoving) {
      const dx = this.touchTargetX - this.player.x;
      const dy = this.touchTargetY - this.player.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist > 10) {
        body.setVelocityX((dx / dist) * PLAYER_SPEED);
        body.setVelocityY((dy / dist) * PLAYER_SPEED);
      }
      // Auto-fire while touching
      firing = true;
    }

    // Keyboard auto-fire or space
    if (firing || moveLeft || moveRight || moveUp || moveDown) {
      if (firing) this.fireBullet();
    }
    // Also fire on space even when not moving
    if (this.spaceKey && this.spaceKey.isDown) {
      this.fireBullet();
    }

    // --- Remove off-screen bullets ---
    this.bullets.getChildren().forEach((b) => {
      const bullet = b as Phaser.Physics.Arcade.Sprite;
      if (bullet.active && bullet.y < -10) {
        bullet.disableBody(true, true);
      }
    });

    // --- Remove off-screen enemies ---
    this.enemies.getChildren().forEach((e) => {
      const enemy = e as Phaser.Physics.Arcade.Sprite;
      if (enemy.active && enemy.y > this.scale.height + 30) {
        enemy.disableBody(true, true);
      }
    });

    // --- Spawn enemies ---
    this.spawnTimer += delta;
    const spawnInterval = Math.max(
      ENEMY_SPAWN_MIN,
      ENEMY_SPAWN_BASE - this.elapsedTime * 10,
    );
    if (this.spawnTimer >= spawnInterval) {
      this.spawnTimer = 0;
      this.spawnEnemy();
    }
  }
}

export function Game({ onScore, onGameOver, paused }: GameProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const gameRef = useRef<Phaser.Game | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const onScoreRef = { current: onScore };
    const onGameOverRef = { current: onGameOver };
    onScoreRef.current = onScore;
    onGameOverRef.current = onGameOver;

    const game = new Phaser.Game({
      type: Phaser.AUTO,
      parent: container,
      width: container.clientWidth,
      height: container.clientHeight,
      backgroundColor: "#0a0a1a",
      physics: {
        default: "arcade",
        arcade: {
          debug: false,
        },
      },
      scene: ShooterScene,
      scale: {
        mode: Phaser.Scale.RESIZE,
        autoCenter: Phaser.Scale.CENTER_BOTH,
      },
      input: {
        keyboard: true,
        touch: true,
      },
    });

    gameRef.current = game;

    // Listen for events from the scene
    game.events.on("ready", () => {
      const scene = game.scene.getScene("ShooterScene");
      if (scene) {
        scene.events.on("score", (s: number) => {
          onScoreRef.current(s);
        });
        scene.events.on("gameover", () => {
          onGameOverRef.current();
        });
      }
    });

    // Update refs when props change
    const interval = setInterval(() => {
      onScoreRef.current = onScore;
      onGameOverRef.current = onGameOver;
    }, 100);

    return () => {
      clearInterval(interval);
      gameRef.current = null;
      game.destroy(true);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const game = gameRef.current;
    if (!game) return;
    const scene = game.scene.getScene("ShooterScene");
    if (!scene) return;
    if (paused) {
      game.scene.pause("ShooterScene");
    } else {
      game.scene.resume("ShooterScene");
    }
  }, [paused]);

  return (
    <div
      ref={containerRef}
      className="w-full h-full"
      style={{ minHeight: "400px" }}
    />
  );
}
