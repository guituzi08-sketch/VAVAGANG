import { addDoc, collection, onSnapshot, query, where } from "firebase/firestore";

export function subscribeToSignaling(db, roomId, localUid, handlers) {
  const signalsRef = collection(db, "rooms", roomId, "signals");
  const candidatesRef = collection(db, "rooms", roomId, "candidates");
  const signalUnsubscribe = onSnapshot(query(signalsRef, where("to", "==", localUid)), (snapshot) => {
    snapshot.docChanges().filter((change) => change.type === "added").forEach((change) => handlers.onSignal({ id: change.doc.id, ...change.doc.data() }));
  }, handlers.onError);
  const candidateUnsubscribe = onSnapshot(query(candidatesRef, where("to", "==", localUid)), (snapshot) => {
    snapshot.docChanges().filter((change) => change.type === "added").forEach((change) => handlers.onCandidate({ id: change.doc.id, ...change.doc.data() }));
  }, handlers.onError);
  return () => { signalUnsubscribe(); candidateUnsubscribe(); };
}

export function sendSignal(db, roomId, signal) {
  return addDoc(collection(db, "rooms", roomId, "signals"), signal);
}

export function sendCandidate(db, roomId, candidate) {
  return addDoc(collection(db, "rooms", roomId, "candidates"), candidate);
}
