/**
 * Settlement and idempotency proofs for the `game.result` path.
 *
 * These are the tests that justify calling the payload "repaired". They drive
 * the real `useProgressSync` against `createFakeEngine`, a working model of the
 * engine's two idempotency mechanisms (see that file), and assert the XP the
 * player was actually credited — not merely the shape of the request. A payload
 * that is well-formed but keyed wrongly passes a shape assertion and still pays
 * twice; only asserting on the ledger catches that.
 *
 * Four settlement rules are proven here, in the order they matter:
 *
 *   1. An authenticated result reaches `/events/batch` and is paid once.
 *   2. A REPLAYED event id does not pay twice (`processed_events`).
 *   3. A NEW event id for the same run + question does not pay twice
 *      (`game_question_awards`) — this is the refresh case, and the one the
 *      event_id mechanism alone cannot cover.
 *   4. The same question in a NEW run settles again — the rule is "once per
 *      question per run", not "once per question ever".
 *
 * Guest-play locality and token-storage hygiene are proven in
 * `useProgressSync.test.js` and `tokenStorage.test.js` respectively.
 */
import { renderHook } from '../../testUtils/renderHook.js';
import { createFakeEngine } from '../../testUtils/fakeEngine.js';
import { useProgressSync } from '../useProgressSync.js';
import * as idbUtils from '../idbUtils.js';

jest.mock('../idbUtils.js', () => {
    const store = new Map();
    return {
        __store: store,
        getRecord: jest.fn(async (storeName, key) => store.get(`${storeName}:${key}`) ?? null),
        putRecord: jest.fn(async (storeName, record) => {
            store.set(`${storeName}:${record.key}`, record);
            return true;
        }),
    };
});

const ENGINE_URL = 'https://rlc-api.sparxstar.com/api/v1';
const SUITE_TOKEN = 'suite-token';

function getOutbox() {
    return idbUtils.__store.get('progress-outbox:progress-outbox:pending')?.events ?? [];
}

function setOutbox(events) {
    idbUtils.__store.set('progress-outbox:progress-outbox:pending', {
        key: 'progress-outbox:pending',
        events,
    });
}

/** A hook wired to the engine with a valid token — the signed-in adult case. */
function mountAuthenticated() {
    return renderHook(useProgressSync, {
        restUrl: 'https://dictionary.sparxstar.com/wp-json/sparxstar/v1/dictionary',
        engineUrl: ENGINE_URL,
        getSuiteToken: () => SUITE_TOKEN,
    });
}

/** One correct answer, worth 10 XP under the dictionary_quiz manifest. */
function correctResult(runId, wordUuid) {
    return {
        type: 'game_result',
        run_id: runId,
        word_uuid: wordUuid,
        game: 'listen_write',
        outcome: 'correct',
        attempts: 1,
        time_ms: 1200,
    };
}

let engine;

beforeEach(() => {
    idbUtils.__store.clear();
    jest.clearAllMocks();
    engine = createFakeEngine({ token: SUITE_TOKEN });
    window.fetch = jest.fn(engine.fetch);
});

afterEach(() => {
    delete window.fetch;
});

describe('authenticated results reach the engine and settle', () => {
    it('POSTs a conformant game.result to /events/batch and credits the award once', async () => {
        const { result } = mountAuthenticated();
        await result.current.addEvent(correctResult('run-1', 'word-a'));

        await result.current.syncNow();

        expect(window.fetch).toHaveBeenCalledTimes(1);
        expect(window.fetch.mock.calls[0][0]).toBe(`${ENGINE_URL}/events/batch`);
        expect(window.fetch.mock.calls[0][1].headers.Authorization).toBe(`Bearer ${SUITE_TOKEN}`);

        /* Every field the engine's GameResultInput requires, present and
         * correctly keyed. session_id is the run; deal_id is the question. */
        const [sent] = engine.requests[0].events;
        expect(sent.event_type).toBe('game.result');
        expect(typeof sent.event_id).toBe('string');
        expect(sent.event_id.length).toBeGreaterThan(0);
        expect(sent.payload).toMatchObject({
            game_type: 'dictionary_quiz',
            session_id: 'run-1',
            deal_id: 'word-a',
            outcome: 'correct',
            attempts: 1,
            time_ms: 1200,
        });

        expect(engine.xpFor()).toBe(10);
        expect(getOutbox()).toHaveLength(0); // accepted -> drained
    });

    it('sends no xp or score of its own — the engine derives the award', async () => {
        const { result } = mountAuthenticated();
        await result.current.addEvent(correctResult('run-1', 'word-a'));
        await result.current.syncNow();

        const { payload } = engine.requests[0].events[0];
        expect(payload).not.toHaveProperty('xp');
        expect(payload).not.toHaveProperty('score');
        expect(engine.xpFor()).toBe(10); // derived from outcome, not from the client
    });
});

describe('a replayed event id does not pay twice', () => {
    it('re-flushing the identical queued event is a no-op server-side', async () => {
        const { result } = mountAuthenticated();
        await result.current.addEvent(correctResult('run-1', 'word-a'));
        const [queued] = getOutbox();

        await result.current.syncNow();
        expect(engine.xpFor()).toBe(10);

        /* The classic replay: the drain never persisted (a crash, a closed tab,
         * an IndexedDB write that failed), so the same event — same event_id —
         * is offered again on the next flush. */
        setOutbox([queued]);
        await result.current.syncNow();

        expect(window.fetch).toHaveBeenCalledTimes(2);
        expect(engine.requests[1].events[0].event_id).toBe(queued.event_id);
        expect(engine.xpFor()).toBe(10); // still 10, not 20
    });

    it('assigns an event id once at queue time and never regenerates it', async () => {
        const { result } = mountAuthenticated();
        await result.current.addEvent(correctResult('run-1', 'word-a'));
        const idAtQueueTime = getOutbox()[0].event_id;

        /* Fail the first flush so the event stays queued, then flush again.
         * A client that minted a fresh id per attempt would defeat the
         * engine's event_id dedupe entirely. */
        window.fetch.mockResolvedValueOnce({ ok: false, status: 503 });
        await result.current.syncNow();
        expect(getOutbox()[0].event_id).toBe(idAtQueueTime);

        await result.current.syncNow();
        expect(engine.requests[0].events[0].event_id).toBe(idAtQueueTime);
        expect(engine.xpFor()).toBe(10);
    });
});

describe('a new event id for the same run and question does not pay twice', () => {
    it('re-queuing the same result under a fresh event id still settles to zero', async () => {
        const { result } = mountAuthenticated();

        await result.current.addEvent(correctResult('run-1', 'word-a'));
        await result.current.syncNow();
        expect(engine.xpFor()).toBe(10);

        /* This is the refresh case. The player reloads mid-run, the outbox is
         * rebuilt, and the same answer is queued again — addEvent mints a NEW
         * event_id, so `processed_events` cannot help. The per-question claim
         * on (dictionary_quiz, run-1, word-a, account) is what holds. */
        await result.current.addEvent(correctResult('run-1', 'word-a'));
        const secondId = getOutbox()[0].event_id;
        await result.current.syncNow();

        const firstId = engine.requests[0].events[0].event_id;
        expect(secondId).not.toBe(firstId); // genuinely a different event
        expect(engine.requests[1].events[0].payload).toMatchObject({
            session_id: 'run-1',
            deal_id: 'word-a',
        });
        expect(engine.xpFor()).toBe(10); // still 10 — the question was already claimed
    });

    it('a different outcome for an already-claimed question does not top up the award', async () => {
        const { result } = mountAuthenticated();

        await result.current.addEvent({ ...correctResult('run-1', 'word-a'), outcome: 'learning' });
        await result.current.syncNow();
        expect(engine.xpFor()).toBe(5); // learning = 5

        await result.current.addEvent(correctResult('run-1', 'word-a')); // correct = 10
        await result.current.syncNow();

        /* The first settled report of a question is the one of record. A later
         * "better" outcome must not be paid the difference. */
        expect(engine.xpFor()).toBe(5);
    });
});

describe('the same question in a new run may settle again', () => {
    it('pays a second time when the run id changes', async () => {
        const { result } = mountAuthenticated();

        await result.current.addEvent(correctResult('run-1', 'word-a'));
        await result.current.syncNow();
        expect(engine.xpFor()).toBe(10);

        /* A genuinely new play-through: useGameSession mints a fresh runId per
         * initSession, so the claim key differs and the award is real. Replay
         * value is the point — "once per question ever" would mean a learner
         * could never earn from practising the same word again. */
        await result.current.addEvent(correctResult('run-2', 'word-a'));
        await result.current.syncNow();

        expect(engine.xpFor()).toBe(20);
        expect(engine.awards.size).toBe(2);
    });

    it('keeps every question in one run on its own claim', async () => {
        const { result } = mountAuthenticated();

        await result.current.addEvent(correctResult('run-1', 'word-a'));
        await result.current.addEvent(correctResult('run-1', 'word-b'));
        await result.current.addEvent(correctResult('run-1', 'word-c'));
        await result.current.syncNow();

        expect(engine.xpFor()).toBe(30);
        expect(engine.awards.size).toBe(3);
    });
});

describe('run identifiers survive the engine boundary', () => {
    it('produces a run key inside the engine column width once namespaced', async () => {
        const { result } = mountAuthenticated();
        await result.current.addEvent(correctResult('run-1', 'word-a'));
        await result.current.syncNow();

        /* The engine stores `solo:<run_id>` in a varchar(128). A run id that
         * overflows once prefixed is treated as absent and the event is
         * refused, so the client must stay inside the budget. */
        const { session_id: runId } = engine.requests[0].events[0].payload;
        expect(`solo:${runId}`.length).toBeLessThanOrEqual(128);
        expect(engine.xpFor()).toBe(10);
    });
});
