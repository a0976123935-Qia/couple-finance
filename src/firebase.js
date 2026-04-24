import { initializeApp } from "firebase/app";
import { getDatabase, ref, set, get, onValue, off } from "firebase/database";

const firebaseConfig = {
  apiKey: "AIzaSyAu8oxVWW3SudPg_wTEv1USNMR1K4A0a3I",
  authDomain: "couple-finance-121d4.firebaseapp.com",
  databaseURL: "https://couple-finance-121d4-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "couple-finance-121d4",
  storageBucket: "couple-finance-121d4.firebasestorage.app",
  messagingSenderId: "774655795856",
  appId: "1:774655795856:web:5a1a6380a78b2d44f0ae15",
};

let app, db;
try {
  app = initializeApp(firebaseConfig);
  db  = getDatabase(app);
} catch(e) {
  console.error("Firebase init failed", e);
}

export async function cloudSave(roomCode, data) {
  const payload = { ...data, updatedAt: Date.now() };
  await set(ref(db, `rooms/${roomCode}`), payload);
  return payload;
}

export async function cloudLoad(roomCode) {
  try {
    const snap = await get(ref(db, `rooms/${roomCode}`));
    return snap.exists() ? snap.val() : null;
  } catch(e) {
    console.error("cloudLoad failed", e);
    return null;
  }
}

export function cloudSubscribe(roomCode, callback) {
  const r = ref(db, `rooms/${roomCode}`);
  onValue(r, (snap) => {
    if (snap.exists()) callback(snap.val());
  });
  return () => off(r);
}
