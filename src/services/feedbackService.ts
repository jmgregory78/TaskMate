import {
  addDoc,
  collection,
  doc,
  getDocs,
  query,
  serverTimestamp,
  Timestamp,
  updateDoc,
  where,
} from 'firebase/firestore';
import { db } from '../config/firebase';
import { FeedbackItem } from '../types/models';

export async function submitFeedback(
  userId: string,
  userEmail: string,
  subject: string,
  message: string
): Promise<void> {
  await addDoc(collection(db, 'feedback'), {
    userId,
    userEmail,
    subject,
    message,
    submittedAt: serverTimestamp(),
    read: false,
  });
}

export async function getUnreadFeedbackCount(): Promise<number> {
  const q = query(collection(db, 'feedback'), where('read', '==', false));
  const snap = await getDocs(q);
  return snap.size;
}

export async function markFeedbackRead(feedbackId: string): Promise<void> {
  await updateDoc(doc(db, 'feedback', feedbackId), { read: true });
}

export async function getAllFeedback(): Promise<FeedbackItem[]> {
  const snap = await getDocs(collection(db, 'feedback'));
  return snap.docs.map((d) => {
    const data = d.data();
    return {
      id: d.id,
      userId: data.userId ?? '',
      userEmail: data.userEmail ?? '',
      subject: data.subject ?? '',
      message: data.message ?? '',
      submittedAt:
        data.submittedAt instanceof Timestamp
          ? data.submittedAt.toDate()
          : new Date(),
      read: !!data.read,
    };
  });
}
