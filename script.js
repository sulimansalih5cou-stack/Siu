// script.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-app.js";
import { getDatabase, ref, onValue, push, update } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-database.js";
import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-auth.js";

const firebaseConfig = {
    apiKey: "AIzaSyA2GNsXj4DzWyCYLKuVT3i1XBKfjX3ccuM",
    authDomain: "siu-students.firebaseapp.com",
    databaseURL: "https://siu-students-default-rtdb.firebaseio.com",
    projectId: "siu-students",
    storageBucket: "siu-students.firebasestorage.app",
    messagingSenderId: "76007314543",
    appId: "1:76007314543:web:4850b668cec4b93bdc699a"
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);
const auth = getAuth(app);

// المتغيرات العامة
let allUsers = [];
let currentUserID = null;

// دالة تنسيق الأرقام
window.formatNumber = (input) => {
    let value = input.value.replace(/,/g, '');
    if (!isNaN(value) && value !== '') input.value = parseFloat(value).toLocaleString('en-US');
};

// مراقبة حالة المستخدم
onAuthStateChanged(auth, (user) => {
    if (user) {
        currentUserID = user.uid;
        loadData();
    } else if (!window.location.href.includes('auth.html')) {
        window.location.href = 'auth.html';
    }
});

function loadData() {
    onValue(ref(db, 'users'), (snapshot) => {
        if (snapshot.exists()) {
            allUsers = Object.keys(snapshot.val()).map(k => ({uid: k, ...snapshot.val()[k]}));
            updateUI();
        }
    });
}

function updateUI() {
    const user = allUsers.find(u => u.uid === currentUserID);
    if (user) {
        if (document.getElementById('userNamePlaceholder')) document.getElementById('userNamePlaceholder').textContent = user.displayName;
        if (document.getElementById('currentBalance')) document.getElementById('currentBalance').textContent = user.balance.toLocaleString();
    }
}

// سيتم إضافة دوال حفظ المصروفات والتسوية هنا بناءً على طلبك لاحقاً..
