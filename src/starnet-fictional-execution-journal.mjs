/**
 * Explicitly temporary-directory scoped, disconnected fictional order journal.
 * Records are hash chained and atomically replaced under a single-writer lock.
 * Never opens broker/wallet networks, user workstation data or real accounts.
 *
 * Limits: cooperative single-host writer only; not power-loss, distributed
 * locking, authentic exchange execution, cryptographic signer, or a cash ledger.
 */
import {createHash, randomUUID} from 'node:crypto';
import {
  open, readFile, realpath, lstat, rename, rm
} from 'node:fs/promises';
import {constants as fsConstants} from 'node:fs';
import {basename, dirname, join, resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {createSimulatedExecutionPort} from './starnet-simulated-execution-port.mjs';
import {createFictionalRiskBook} from './starnet-fictional-risk-book.mjs';
import {deliverFictionalExecutionMessage,validateFictionalExecutionMessage} from './starnet-fictional-message-emulator.mjs';
import {
  validateFictionalReview,validateFictionalStop,reviewFictionalQuarantine,
  fictionalStopSnapshot
} from './starnet-fictional-operator-controls.mjs';

const JOURNAL_SCHEMA = 'project9-fictional-execution-journal-v1';
const SCOPE = 'FICTIONAL_OFFLINE';
const GENESIS = '0'.repeat(64);
const SHA256 = /^[a-f0-9]{64}$/;
const MAX_FILE_BYTES = 2_000_000;
const MAX_ENTRIES = 1_100;
const EXACT_KEYS = Object.freeze(['schema', 'scope', 'entries', 'headHash']);
const ENTRY_KEYS = Object.freeze(['sequence', 'kind', 'payload', 'previousHash', 'hash']);
const fail = message => { throw new Error(message); };
const exact = (value, fields) => value && typeof value === 'object' &&
  !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype &&
  Reflect.ownKeys(value).length === fields.length &&
  fields.every(key => Object.hasOwn(value, key));
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');

function encodeEntry(sequence, kind, payload, previousHash) {
  const safe = JSON.parse(JSON.stringify(payload));
  return {
    sequence, kind, payload: safe, previousHash,
    hash: hash([sequence, kind, safe, previousHash])
  };
}

function emptyState() {
  return {schema:JOURNAL_SCHEMA, scope:SCOPE, entries:[], headHash:GENESIS};
}

function reconstruct(state) {
  if (!exact(state, EXACT_KEYS) ||
      state.schema !== JOURNAL_SCHEMA || state.scope !== SCOPE ||
      !Array.isArray(state.entries) || state.entries.length > MAX_ENTRIES ||
      typeof state.headHash !== 'string' || !SHA256.test(state.headHash)) {
    fail('Invalid fictional execution journal envelope');
  }
  const port = createSimulatedExecutionPort();
  let risk = null;
  let previousHash = GENESIS;
  const intents = new Set();
  const eventIds = new Set();
  const receipts = new Map();
  const reviews = new Map();
  let stop = null;
  state.entries.forEach((entry, index) => {
    if (!exact(entry, ENTRY_KEYS) ||
        entry.sequence !== index + 1 ||
        !['POLICY', 'INTENT', 'EVENT', 'MESSAGE', 'REVIEW', 'STOP'].includes(entry.kind) ||
        entry.previousHash !== previousHash ||
        typeof entry.hash !== 'string' || !SHA256.test(entry.hash) ||
        entry.hash !== hash([entry.sequence, entry.kind, entry.payload, previousHash])) {
      fail('Fictional execution journal sequence or hash verification failed');
    }
    try {
      if(stop!==null) fail('No entries permitted after latched fictional stop');
      if (entry.kind === 'POLICY') {
        if (index !== 0 || risk !== null) fail('Risk policy must be first and unique');
        risk = createFictionalRiskBook(entry.payload);
      } else if (entry.kind === 'INTENT') {
        if (intents.has(entry.payload?.intentId)) fail('Duplicate journal intent');
        if (risk) {
          const decision = risk.prepare(entry.payload);
          if (decision.decision === 'APPROVED') port.submit(entry.payload);
        } else {
          port.submit(entry.payload);
        }
        intents.add(entry.payload.intentId);
      } else if(entry.kind === 'EVENT') {
        if (eventIds.has(entry.payload?.eventId)) fail('Duplicate journal event');
        if (risk) risk.recordEvent(entry.payload);
        port.recordEvent(entry.payload);
        eventIds.add(entry.payload.eventId);
      } else if(entry.kind==='MESSAGE') {
        const payload=entry.payload;
        if(!exact(payload,['message','disposition','reason','simulatedEventId']))
          fail('Malformed fictional message receipt record');
        const message=validateFictionalExecutionMessage(payload.message);
        if(receipts.has(message.messageId)) fail('Repeated fictional delivery identity in journal');
        const receipt=deliverFictionalExecutionMessage(message,{port,risk,seenEventIds:eventIds});
        if(receipt.disposition!==payload.disposition||
           receipt.reason!==payload.reason||
           receipt.simulatedEventId!==payload.simulatedEventId)
          fail('Fictional delivery outcome mismatch on journal replay');
        receipts.set(message.messageId,{message,receipt});
      } else if(entry.kind==='REVIEW'){
        const payload=entry.payload;
        if(!exact(payload,['review','outcome','simulatedEventId']))
          fail('Malformed fictional review journal record');
        const review=validateFictionalReview(payload.review);
        if(reviews.has(review.reviewId)) fail('Repeated review ID in fictional journal');
        const result=reviewFictionalQuarantine(review,{
          receipts,port,risk,eventIds,reviews,stopped:false
        });
        if(result.outcome!==payload.outcome||
           result.simulatedEventId!==payload.simulatedEventId)
          fail('Fictional review outcome disagrees with replayed evidence');
        reviews.set(review.reviewId,{review,result});
      } else if(entry.kind==='STOP'){
        stop=validateFictionalStop(entry.payload);
      }
    } catch(error) {
      fail('Fictional execution journal replay refused: ' + error.message);
    }
    previousHash = entry.hash;
  });
  if (state.headHash !== previousHash) fail('Fictional execution journal head mismatch');
  return {port, risk, receipts, eventIds, reviews, stop};
}

async function readVerified(path) {
  let info;
  try { info = await lstat(path); }
  catch (error) {
    if (error.code === 'ENOENT') return emptyState();
    throw error;
  }
  if (!info.isFile() || info.size > MAX_FILE_BYTES) fail('Unsafe journal file type or size');
  const raw = await readFile(path);
  if (raw.length > MAX_FILE_BYTES) fail('Fictional execution journal too large');
  let data;
  try { data = JSON.parse(raw.toString('utf8')); }
  catch { fail('Corrupt fictional execution journal JSON'); }
  reconstruct(data);
  return data;
}

async function checkLabDirectory(directory) {
  if (typeof directory !== 'string' || !directory.startsWith('/')) {
    fail('Explicit absolute temporary research directory required');
  }
  const pathname = resolve(directory);
  const info = await lstat(pathname);
  if (!info.isDirectory() || (info.mode & 0o077)) {
    fail('Private real directory with mode 0700 required');
  }
  const [parent, systemTmp] = await Promise.all([
    realpath(dirname(pathname)), realpath(tmpdir())
  ]);
  if (parent !== systemTmp || !/^p9-execution-lab-[A-Za-z0-9_-]+$/.test(basename(pathname))) {
    fail('Only a direct, disposable p9-execution-lab-* OS temp folder is permitted');
  }
  return pathname;
}

async function commitAtomic(directory, destination, state, injectFault=null) {
  const bytes = Buffer.from(JSON.stringify(state) + '\n');
  if (bytes.length > MAX_FILE_BYTES) fail('Fictional execution journal size bound exceeded');
  const tempPath = join(directory, '.journal-' + randomUUID() + '.tmp');
  let handle;
  try {
    handle = await open(tempPath,
      fsConstants.O_WRONLY | fsConstants.O_CREAT | fsConstants.O_EXCL, 0o600);
    await handle.writeFile(bytes);
    await handle.sync();
    if (injectFault) await injectFault('BEFORE_RENAME');
    await handle.close();
    handle = null;
    await rename(tempPath, destination);
    if (injectFault) await injectFault('AFTER_RENAME');
    // Best-effort filesystem durability barrier on POSIX local filesystems.
    // A passing sync does NOT establish power-loss or network-FS guarantees.
    const directoryHandle = await open(directory, 'r');
    try { await directoryHandle.sync(); }
    finally { await directoryHandle.close(); }
  } finally {
    if (handle) await handle.close();
    await rm(tempPath, {force:true});
  }
}

/**
 * Open an isolated, single-writer, fictional event journal.
 * Existing lock is deliberately NOT stolen, even if its PID appears dead.
 * Only the caller can create/remove a disposable test directory.
 */
export async function openFictionalExecutionJournal(directory, options={}) {
  if (options===null || typeof options!=='object' || Array.isArray(options) ||
      Object.keys(options).some(k=>k!=='testFaultInjector') ||
      (options.testFaultInjector!==undefined && typeof options.testFaultInjector!=='function')) {
    fail('Unsupported fictional journal options');
  }
  const testFaultInjector=options.testFaultInjector??null;
  const lab = await checkLabDirectory(directory);
  const lockPath = join(lab, '.writer.lock');
  const journalPath = join(lab, 'journal.json');
  const lock = await open(lockPath, 'wx', 0o600);
  const lockId = randomUUID();
  let closed = false;
  let poisoned = false;
  let queue = Promise.resolve();
  let state;
  try {
    await lock.writeFile(JSON.stringify({schema:'fictional-lab-lock-v1',
      pid:process.pid, lockId}) + '\n');
    await lock.sync();
    await lock.close();
    state = await readVerified(journalPath);
  } catch(error) {
    await lock.close().catch(() => {});
    const content = await readFile(lockPath,'utf8').catch(() => '');
    if (content.includes(lockId)) await rm(lockPath,{force:true});
    throw error;
  }

  const perform = task => {
    const pending = queue.then(task);
    queue = pending.then(() => undefined, () => undefined);
    return pending;
  };
  const ensureActive = () => {
    if (closed || poisoned) fail('Fictional journal closed or write outcome uncertain');
  };
  const apply = async (kind, input) => {
    ensureActive();
    const {port,risk,receipts,eventIds,reviews,stop}=reconstruct(state);
    if(stop!==null && kind!=='STOP') fail('Fictional emergency stop latched; restart does not reset it');
    const priorDecisions=risk?.snapshot().orderCount??0;
    const priorOrders=port.list().length;
    const priorEvents=port.list().reduce((sum,order)=>sum+order.eventCount,0);
    let result;
    if (kind==='POLICY') {
      if (risk) {
        if (JSON.stringify(state.entries[0].payload)!==JSON.stringify(input))
          fail('Cannot replace persisted fictional policy');
        return risk.snapshot();
      }
      if (state.entries.length!==0) fail('Cannot enable risk after unguarded journal entries');
      result=createFictionalRiskBook(input).snapshot();
    } else if (kind==='INTENT') {
      if (risk) {
        result=risk.prepare(input);
        if (result.decision==='APPROVED') port.submit(input);
      } else result=port.submit(input);
    } else if (kind==='EVENT') {
      if (risk) risk.recordEvent(input);
      result=port.recordEvent(input);
    } else if(kind==='MESSAGE') {
      const message=validateFictionalExecutionMessage(input);
      const previous=receipts.get(message.messageId);
      if(previous) {
        if(Object.keys(message).some(key=>message[key]!==previous.message[key]))
          fail('Conflicting fictional message ID retry');
        return Object.freeze({...previous.receipt,redelivery:'EXACT_RETRY_NO_WRITE'});
      }
      result=deliverFictionalExecutionMessage(message,{port,risk,seenEventIds:eventIds});
    } else if(kind==='REVIEW'){
      const review=validateFictionalReview(input);
      const prior=reviews.get(review.reviewId);
      if(prior){
        if(JSON.stringify(prior.review)!==JSON.stringify(review))
          fail('Conflicting fictional review ID retry');
        return Object.freeze({...prior.result,redelivery:'EXACT_RETRY_NO_WRITE'});
      }
      result=reviewFictionalQuarantine(review,{
        receipts,port,risk,eventIds,reviews,stopped:false
      });
    } else if(kind==='STOP'){
      const request=validateFictionalStop(input);
      // STOP never mutates an order. It is an irreversible local journal latch.
      result=fictionalStopSnapshot(request);
    } else fail('Unknown fictional journal operation');
    const newDecisions=risk?.snapshot().orderCount??0;
    const newOrders=port.list().length;
    const newEvents=port.list().reduce((sum,order)=>sum+order.eventCount,0);
    if(kind!=='POLICY' && kind!=='MESSAGE' && kind!=='REVIEW' &&
       kind!=='STOP' && priorDecisions===newDecisions &&
       priorOrders===newOrders && priorEvents===newEvents) return result;
    if (state.entries.length>=MAX_ENTRIES) fail('Fictional journal entry cap exceeded');
    const next=structuredClone(state);
    const payload=kind==='MESSAGE'
      ? {message:input,disposition:result.disposition,reason:result.reason,
         simulatedEventId:result.simulatedEventId}
      : kind==='REVIEW'
        ? {review:input,outcome:result.outcome,simulatedEventId:result.simulatedEventId}
        : input;
    const entry=encodeEntry(next.entries.length+1,kind,payload,next.headHash);
    next.entries.push(entry);
    next.headHash=entry.hash;
    try {
      await commitAtomic(lab,journalPath,next,testFaultInjector);
      state=next;
    } catch(error) {
      poisoned=true; // commit may have passed rename; always re-open for truth
      throw error;
    }
    return result;
  };

  return Object.freeze({
    initializeRiskPolicy: policy => perform(() => apply('POLICY',policy)),
    submit: intent => perform(() => apply('INTENT', intent)),
    recordEvent: event => perform(() => apply('EVENT', event)),
    receiveFictionalMessage: message => perform(() => apply('MESSAGE', message)),
    reviewFictionalMessage: review => perform(() => apply('REVIEW',review)),
    emergencyStopFictionalLab: request => perform(() => apply('STOP',request)),
    get: intentId => perform(() => {
      ensureActive();
      return reconstruct(state).port.get(intentId);
    }),
    report: () => perform(() => {
      ensureActive();
      const {port,risk,receipts,reviews,stop} = reconstruct(state);
      return Object.freeze({
        schema:JOURNAL_SCHEMA, scope:SCOPE,
        revision:state.entries.length, headHash:state.headHash,
        records:port.list(),
        messageCount:receipts.size,
        messages:Object.freeze(Array.from(receipts.values(),x=>x.receipt)),
        reviewCount:reviews.size,
        reviews:Object.freeze(Array.from(reviews.values(),x=>x.result)),
        emergencyStop:fictionalStopSnapshot(stop),
        ...(risk ? {risk:risk.snapshot()} : {}),
        controls:Object.freeze({
          brokerConnected:false, walletConnected:false, chainConnected:false,
          actualOrders:0, blockchainBroadcasts:0,
          operatorAcceptance:'NOT_RUN', productionGate:'NO_GO'
        })
      });
    }),
    close: () => perform(async () => {
      if (closed) return;
      closed = true;
      const raw = await readFile(lockPath,'utf8').catch(() => '');
      if (!raw.includes(lockId)) fail('Fictional journal writer lock changed; manual review needed');
      await rm(lockPath);
    })
  });
}
