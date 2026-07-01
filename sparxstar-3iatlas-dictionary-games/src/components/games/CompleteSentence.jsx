import React, { useState, useMemo, useRef } from "react";
import AccessoryBar from "../AccessoryBar.jsx";

/**
 * CompleteSentence — Game 4.4
 *
 * An example sentence is shown with the target word blanked out.
 * Player types the missing word using the keyboard + AccessoryBar.
 * Wrong answers progressively reveal letters.
 *
 * Only words with an example sentence are used. Supports both the /game-set shape
 * (word.example: { sentence, translation_en }) and the /lookup shape
 * (word.example_sentences[0]: { sentence, translation_en, translation_fr, ... }).
 *
 * Props:
 *   words      {Array}    Game-set words
 *   language   {string}   'en' | 'fr'
 *   onResult   {Function} (uuid, outcome, attempts, xp) => void
 *   onComplete {Function} () => void
 */
export default function CompleteSentence({
  words,
  language,
  onResult,
  onComplete,
}) {
  // Require the headword to actually appear in the sentence — otherwise the blank
  // substitution is a no-op and the answer is left visible, defeating the game.
  const deck = useMemo(
    () =>
      shuffle(
        words.filter((w) => {
          const example = w.example ?? w.example_sentences?.[0] ?? null;
          return (
            example?.sentence &&
            w.headword &&
            new RegExp(
              `(?<![a-zA-Z0-9_ŋɓɗñɲʔ])${escapeRegex(w.headword)}(?![a-zA-Z0-9_ŋɓɗñɲʔ])`,
              "i",
            ).test(example.sentence)
          );
        }),
      ),
    [words],
  );

  const [index, setIndex] = useState(0);
  const [input, setInput] = useState("");
  const [attempts, setAttempts] = useState(0);
  const [revealed, setRevealed] = useState("");
  const [status, setStatus] = useState(null); /* 'correct' | 'wrong' | null */
  const inputRef = useRef(null);

  const word = deck[index];

  if (deck.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center p-8 text-center">
        <p className="text-gray-400 italic text-sm">
          No words with example sentences in this set.
        </p>
      </div>
    );
  }

  if (!word) return null;

  const target = word.headword;
  const example = word.example ?? word.example_sentences?.[0] ?? null;
  const sentence = example?.sentence ?? "";
  const sentenceTranslation =
    language === "fr" && example?.translation_fr
      ? example.translation_fr
      : (example?.translation_en ?? "");

  /* Replace first occurrence of the headword (case-insensitive) with blanks.
   * Lookarounds include Mandinka-specific chars to avoid matching substrings
   * inside longer words (e.g. 'la' inside 'lavage'). */
  const regex = new RegExp(
    `(?<![a-zA-Z0-9_ŋɓɗñɲʔ])(${escapeRegex(target)})(?![a-zA-Z0-9_ŋɓɗñɲʔ])`,
    "i",
  );
  const blankDisplay =
    status === "correct"
      ? target
      : revealed + "_".repeat(Math.max(0, target.length - revealed.length));
  const displaySentence = sentence.replace(regex, `[${blankDisplay}]`);

  const handleSubmit = (e) => {
    e?.preventDefault();
    if (status === "correct") return;

    const attempt = input.trim();
    const isCorrect = attempt.toLowerCase() === target.toLowerCase();

    if (isCorrect) {
      setStatus("correct");
      onResult(word.uuid, "correct", attempts + 1, 8);
      setTimeout(() => advance(), 1500);
    } else {
      const nextAttempts = attempts + 1;
      setAttempts(nextAttempts);
      setInput("");

      if (nextAttempts >= 3) {
        /* Show full word and advance. */
        setRevealed(target);
        setStatus("wrong");
        onResult(word.uuid, "learning", 3, 0);
        setTimeout(() => advance(), 2000);
      } else {
        /* Reveal next letter. */
        setRevealed(target.substring(0, nextAttempts));
      }
    }
  };

  const advance = () => {
    if (index + 1 >= deck.length) {
      onComplete();
    } else {
      setIndex((i) => i + 1);
      setInput("");
      setAttempts(0);
      setRevealed("");
      setStatus(null);
    }
  };

  return (
    <div className="flex flex-col h-full p-4 gap-4">
      {/* Header */}
      <div className="flex items-center justify-between text-sm text-gray-500 dark:text-gray-400 shrink-0">
        <span className="font-semibold" style={{ color: "#E91E8C" }}>
          Complete the Sentence
        </span>
        <span>
          {index + 1} / {deck.length}
        </span>
      </div>

      <ProgressBar current={index} total={deck.length} />

      {/* Sentence display */}
      <div
        className="shrink-0 p-4 rounded-xl border-l-4"
        style={{ background: "#F8F9FA", borderColor: "#E91E8C" }}
      >
        <p className="text-base text-gray-800 leading-relaxed">
          {displaySentence}
        </p>
        {sentenceTranslation && (
          <p className="text-sm text-gray-500 italic mt-2">
            {sentenceTranslation}
          </p>
        )}
      </div>

      {/* Blank tiles (word length indicator) */}
      <div className="flex gap-1.5 justify-center flex-wrap shrink-0">
        {target.split("").map((char, i) => {
          const isKnown = i < revealed.length || status === "correct";
          return (
            <div
              key={i}
              className="w-8 h-9 flex items-center justify-center rounded border-b-2 font-bold text-base uppercase"
              style={
                isKnown
                  ? {
                      borderColor: status === "correct" ? "#4CAF50" : "#E91E8C",
                      color: "#374151",
                    }
                  : { borderColor: "#E91E8C", color: "transparent" }
              }
            >
              {isKnown ? (i < revealed.length ? revealed[i] : char) : "_"}
            </div>
          );
        })}
      </div>

      {/* Feedback */}
      {status === "correct" && (
        <p className="text-center text-green-600 font-bold shrink-0">+8 XP ✓</p>
      )}
      {status === "wrong" && (
        <p className="text-center text-gray-500 text-sm shrink-0">
          The word was: <strong>{target}</strong>
        </p>
      )}

      {/* Input form */}
      {!status && (
        <form onSubmit={handleSubmit} className="flex gap-2 shrink-0">
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={`Type the missing word (${target.length} letters)`}
            className="flex-1 px-4 py-3 rounded-xl bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none text-sm"
            autoComplete="off"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            data-aiwa-input="true"
          />
          <button
            type="submit"
            className="px-4 py-3 rounded-xl font-semibold text-sm text-white transition-colors"
            style={{ background: "#E91E8C" }}
          >
            Check
          </button>
        </form>
      )}

      {/* Hint for attempts */}
      {attempts > 0 && !status && (
        <p className="text-xs text-gray-400 text-center shrink-0">
          Hint: starts with &ldquo;{revealed}&rdquo;
        </p>
      )}

      {/* Accessory bar — rendered at fixed bottom above keyboard */}
      <AccessoryBar />
    </div>
  );
}

function ProgressBar({ current, total }) {
  const pct = total > 0 ? (current / total) * 100 : 0;
  return (
    <div className="h-1.5 w-full bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden shrink-0">
      <div
        className="h-full rounded-full transition-all"
        style={{ width: `${pct}%`, background: "#E91E8C" }}
      />
    </div>
  );
}

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
