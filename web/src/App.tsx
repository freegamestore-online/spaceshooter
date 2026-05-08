import { useState, useCallback, useEffect, useRef } from "react";
import { GameShell, GameTopbar, GameAuth } from "@freegamestore/games";
import { Game } from "./components/Game";
import { useLeaderboard } from "./hooks/useLeaderboard";
import type { GamePhase } from "./types";

const BEST_SCORE_KEY = "freespace-best";

function getBestScore(): number {
  const v = localStorage.getItem(BEST_SCORE_KEY);
  return v ? parseInt(v, 10) : 0;
}

export default function App() {
  const [phase, setPhase] = useState<GamePhase>("playing");
  const [score, setScore] = useState(0);
  const [bestScore, setBestScore] = useState(getBestScore);
  const [paused, setPaused] = useState(false);
  const [lives, setLives] = useState(3);
  const scoreRef = useRef(0);
  const { submitScore } = useLeaderboard("spaceshooter");

  const handleScore = useCallback((s: number) => {
    scoreRef.current = s;
    setScore(s);
  }, []);

  const handleGameOver = useCallback(() => {
    const final = scoreRef.current;
    const best = getBestScore();
    if (final > best) {
      localStorage.setItem(BEST_SCORE_KEY, String(final));
      setBestScore(final);
    }
    submitScore(final);
    setPhase("over");
  }, [submitScore]);

  const handleLives = useCallback((l: number) => {
    setLives(l);
  }, []);

  const start = useCallback(() => {
    setScore(0);
    scoreRef.current = 0;
    setLives(3);
    setPhase("playing");
  }, []);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (phase !== "playing" && (e.key === " " || e.key === "Enter")) {
        start();
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [phase, start]);

  return (
    <GameShell
      topbar={
        <GameTopbar
          title="Space Shooter"
          stats={[
            { label: "Score", value: score, accent: true },
            { label: "Best", value: bestScore },
            { label: "Lives", value: "\u2665".repeat(lives) },
          ]}
          onPlayPause={phase === "playing" ? () => setPaused(p => !p) : undefined}
          paused={paused}
          onRestart={start}
          actions={<GameAuth />}
          rules={<div><h3 style={{fontWeight:700}}>Space Shooter</h3><h4 style={{fontWeight:600}}>Controls</h4><ul><li>Arrow keys or touch to move</li><li>Auto-fire or tap to shoot</li></ul><h4 style={{fontWeight:600}}>Rules</h4><ul><li>Fly your ship, shoot enemies</li><li>Enemies get harder over time</li><li>Score for each kill</li></ul></div>}
        />
      }
    >
      <div className="relative w-full h-full">
        {phase === "playing" ? (
          <Game onScore={handleScore} onGameOver={handleGameOver} onLives={handleLives} paused={paused} />
        ) : (
          <div className="flex flex-col items-center justify-center h-full gap-4">
            <p className="text-xl font-bold" style={{ color: "var(--error)", fontFamily: "Fraunces, serif" }}>Game Over! Score: {score}</p>
            <button onClick={start} className="px-6 py-3 rounded-xl font-semibold" style={{ background: "var(--accent)", color: "#fff" }}>
              Play Again
            </button>
            <p className="text-xs" style={{ color: "var(--muted)" }}>Press Space or Enter to start</p>
          </div>
        )}
      </div>
    </GameShell>
  );
}
