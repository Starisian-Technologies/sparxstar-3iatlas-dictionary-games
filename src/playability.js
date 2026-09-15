/**
 * What each game needs from a word, in one place.
 *
 * ====================== WHY THIS FILE EXISTS ============================
 *
 * Every game carried its own eligibility filter, applied AFTER the round had
 * been dealt and the player had pressed Start. `ListenWrite` kept the words
 * with audio, `CompleteSentence` the ones whose example sentence actually
 * contains the headword, `ArrangeWord` and `LetterReveal` the spellable ones —
 * each correct on its own, and each invisible until too late.
 *
 * Two defects came out of that, both of them things the player sees:
 *
 *   A TEN-WORD ROUND THAT IS NOT TEN WORDS. Selection dealt ten words it
 *   believed playable, the game then discarded most of them, and the session
 *   ran short with no explanation. The count the player chose was never the
 *   count they got.
 *
 *   "No words are available for this game yet" — AFTER starting. The filter
 *   emptied the deck, so the game rendered its empty state as the answer to a
 *   question the player had already committed to. Whether a game can be played
 *   is knowable before it is offered, and that is where it must be answered.
 *
 * So the predicates live here, are applied BEFORE selection so a dealt round is
 * a playable round, and are applied AGAIN at setup so an unplayable game is
 * disabled with its reason rather than offered and then withdrawn.
 *
 * NOTHING HERE WIDENS ELIGIBILITY. These are the same rules the games already
 * enforced, moved earlier and given a name. Rights, approval and domain are
 * decided upstream by the Dictionary and are never revisited here.
 */

import { isSpellable } from './orthography.js';

/** Escape a headword for use inside a RegExp. */
function escapeRegex(text) {
    return String(text ?? '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * The example sentence attached to a word, from either shape.
 *
 * A GamePack carries at most one `example`; the adapter republishes it as
 * `example_sentences`. Both are read because a host may mount the games
 * against either.
 */
export function exampleFor(word) {
    return word?.example ?? word?.example_sentences?.[0] ?? null;
}

/**
 * Does this word's example sentence actually contain the word?
 *
 * A sentence that does not contain the headword cannot have a blank cut out of
 * it, so "has an example" is not the question `CompleteSentence` needs asked.
 */
export function hasUsableSentence(word) {
    const example = exampleFor(word);
    const headword = word?.headword ?? '';
    if (!example?.sentence || !headword) return false;
    return new RegExp(escapeRegex(headword), 'i').test(example.sentence);
}

/** Is there a meaning to match against — the gloss, not a definition? */
export function hasMeaning(word) {
    return typeof word?.translation_en === 'string' && word.translation_en.trim().length > 0;
}

/** Is there a consented, playable recording? */
export function hasAudio(word) {
    return typeof word?.audio_url === 'string' && word.audio_url.length > 0;
}

/**
 * Why this game cannot deal this word, or null when it can.
 *
 * Returning the REASON rather than a boolean is what lets setup say "this game
 * needs example sentences" instead of "no words available" — the player can act
 * on the first and not on the second.
 */
export function unplayableReason(word, gameId, languageCode) {
    switch (gameId) {
        case 'listen_write':
            if (!hasAudio(word)) return 'no-audio';
            return isSpellable(word?.headword ?? '', languageCode) ? null : 'not-spellable';

        case 'arrange_word':
        case 'letter_reveal':
            return isSpellable(word?.headword ?? '', languageCode) ? null : 'not-spellable';

        case 'complete_sentence':
            if (!isSpellable(word?.headword ?? '', languageCode)) return 'not-spellable';
            return hasUsableSentence(word) ? null : 'no-sentence';

        case 'meaning_match':
            return hasMeaning(word) ? null : 'no-meaning';

        case 'domain_flash':
            /*
             * A flashcard shows the written word and its meaning. Without a
             * meaning there is nothing on the back of the card, which is the
             * self-graded equivalent of an unanswerable question.
             */
            if (!(word?.headword ?? '').trim()) return 'no-headword';
            return hasMeaning(word) ? null : 'no-meaning';

        default:
            return (word?.headword ?? '').trim() ? null : 'no-headword';
    }
}

/** Can this game deal this word? */
export function isPlayableFor(word, gameId, languageCode) {
    return unplayableReason(word, gameId, languageCode) === null;
}

/**
 * Split a pack into what a game may deal and why the rest was refused.
 *
 * @returns {{playable: Array, rejected: Array<{word: object, reason: string}>,
 *   reasons: Record<string, number>}}
 */
export function partitionForGame(words, gameId, languageCode) {
    const playable = [];
    const rejected = [];
    const reasons = {};
    for (const word of words ?? []) {
        const reason = unplayableReason(word, gameId, languageCode);
        if (reason === null) playable.push(word);
        else {
            rejected.push({ word, reason });
            reasons[reason] = (reasons[reason] ?? 0) + 1;
        }
    }
    return { playable, rejected, reasons };
}

/**
 * What to tell a player about a game that cannot run, in their words.
 *
 * Keyed by the dominant refusal reason. "No words are available for this game
 * yet" told the player nothing they could act on; every line here names the
 * missing thing and implies the move.
 */
export const SHORTAGE_MESSAGE = {
    'no-audio': 'This game needs recorded audio. Choose another game or domain for now.',
    'no-sentence': 'This game needs example sentences. Choose another game or domain for now.',
    'no-meaning': 'This game needs word meanings. Choose another game or domain for now.',
    'not-spellable': 'These words cannot be spelled out yet. Choose another game or domain.',
    'no-headword': 'These words are missing their written form. Choose another game or domain.',
    empty: 'No words here yet. Choose another domain for now.',
};

/**
 * Whether a game can be offered at all, and what to say when it cannot.
 *
 * `count` is how many playable words exist — the number setup shows when the
 * round has to be shortened, so the player is told the real length before they
 * commit rather than discovering it as they run out of questions.
 *
 * @returns {{playable: boolean, count: number, reason: string|null, message: string|null}}
 */
export function availabilityFor(words, { gameId, languageCode }) {
    const pack = words ?? [];
    if (pack.length === 0) {
        return { playable: false, count: 0, reason: 'empty', message: SHORTAGE_MESSAGE.empty };
    }

    const { playable, reasons } = partitionForGame(pack, gameId, languageCode);
    if (playable.length > 0) {
        return { playable: true, count: playable.length, reason: null, message: null };
    }

    /*
     * The DOMINANT reason, not the first one seen. A pack where one word lacks
     * audio and forty lack sentences is a sentence problem, and saying so is
     * the difference between a player switching domain and a player giving up.
     */
    const dominant = Object.entries(reasons).sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'empty';
    return {
        playable: false,
        count: 0,
        reason: dominant,
        message: SHORTAGE_MESSAGE[dominant] ?? SHORTAGE_MESSAGE.empty,
    };
}
