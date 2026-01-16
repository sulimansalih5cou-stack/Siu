// 🔥 استيراد Firebase SDK
import { initializeApp } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-app.js";
import { getDatabase, ref, onValue, push, update, runTransaction } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-database.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-auth.js";

const firebaseConfig = {
    apiKey: "AIzaSyA2GNsXj4DzWyCYLKuVT3i1XBKfjX3ccuM",
    authDomain: "siu-students.firebaseapp.com",
    databaseURL: "https://siu-students-default-rtdb.firebaseio.com",
    projectId: "siu-students",
    storageBucket: "siu-students.firebasestorage.app",
    messagingSenderId: "76007314543",
    appId: "1:76007314543:web:4850b668cec4b93bdc699a",
    measurementId: "G-SB6884R2FX"
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);
const auth = getAuth(app);
window.db = db; // جعله متاحاً للملفات الأخرى

let currentUserID = null;
let currentUserDB = null;
let allUsers = [];
let allExpenses = [];
let userNotifications = [];

// ==========================================
// 🔔 منطق الإشعارات المتطور
// ==========================================

function loadNotifications() {
    if (!currentUserID) return;
    const notifRef = ref(db, 'notifications');
    onValue(notifRef, (snapshot) => {
        if (snapshot.exists()) {
            const data = snapshot.val();
            userNotifications = Object.keys(data)
                .map(key => ({ id: key, ...data[key] }))
                .filter(n => n.uid === currentUserID)
                .sort((a, b) => b.timestamp - a.timestamp);

            const unreadCount = userNotifications.filter(n => !n.is_read).length;
            if (window.updateBellBadge) window.updateBellBadge(unreadCount);
            
            renderNotificationsInModal();
        }
    });
}

window.markAllAsRead = async function() {
    const unread = userNotifications.filter(n => !n.is_read);
    if (unread.length === 0) return;
    const updates = {};
    unread.forEach(n => { updates[`notifications/${n.id}/is_read`] = true; });
    await update(ref(db), updates);
}

window.showNotifications = function() {
    const modal = document.getElementById('notificationModal');
    if (modal) modal.classList.add('show');
}

function renderNotificationsInModal() {
    const list = document.getElementById('notificationsList');
    if (!list) return;
    if (userNotifications.length === 0) {
        list.innerHTML = '<p class="text-center text-gray-400 py-4">لا توجد إشعارات</p>';
        return;
    }
    list.innerHTML = userNotifications.map(n => `
        <div class="p-3 mb-2 rounded-lg ${n.is_read ? 'bg-gray-50' : 'bg-blue-50 border-r-4 border-blue-500'}">
            <p class="text-sm font-semibold text-gray-800">${n.message}</p>
            <p class="text-xs text-gray-400 mt-1">${new Date(n.timestamp).toLocaleTimeString('ar-EG')}</p>
        </div>
    `).join('');
}

// ==========================================
// 🏠 التحديثات الأساسية للواجهة
// ==========================================

function updateHomeDisplay() {
    if (!currentUserDB) return;
    const nameEl = document.getElementById('userNamePlaceholder');
    const balanceEl = document.getElementById('currentBalance');
    const sidebarName = document.getElementById('sidebarUserName');
    const sidebarEmail = document.getElementById('sidebarUserEmail');

    if (nameEl) nameEl.textContent = currentUserDB.displayName;
    if (sidebarName) sidebarName.textContent = currentUserDB.displayName;
    if (sidebarEmail) sidebarEmail.textContent = auth.currentUser.email;
    if (balanceEl) balanceEl.textContent = currentUserDB.balance.toLocaleString();
}

// ==========================================
// 🔐 المصادقة وبدء التشغيل
// ==========================================

onAuthStateChanged(auth, (user) => {
    if (user) {
        currentUserID = user.uid;
        loadInitialData();
        loadNotifications();
    } else {
        if (!window.location.href.includes('auth.html')) window.location.href = 'auth.html';
    }
});

function loadInitialData() {
    onValue(ref(db, 'users'), (snap) => {
        if (snap.exists()) {
            allUsers = Object.keys(snap.val()).map(k => ({uid: k, ...snap.val()[k]}));
            currentUserDB = allUsers.find(u => u.uid === currentUserID);
            updateHomeDisplay();
        }
    });
}
