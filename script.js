// 🔥 Firebase Imports
import { initializeApp } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-app.js";
import { getDatabase, ref, onValue, push, update } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-database.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-auth.js";

// 🛑 إعدادات Firebase
const firebaseConfig = {
    // استخدم إعدادات مشروعك الحالية هنا
    apiKey: "AIzaSyA2GNsXj4DzWyCYLKuVT3i1XBKfjX3ccuM",
    authDomain: "siu-students.firebaseapp.com",
    databaseURL: "https://siu-students-default-rtdb.firebaseio.com",
    projectId: "siu-students",
    messagingSenderId: "76007314543",
    appId: "1:76007314543:web:4850b668cec4b93bdc699a"
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);
const auth = getAuth(app);

// المتغيرات العامة التي تحمل حالة التطبيق
let allUsers = []; 
let currentUserID = null; 
let currentUserDB = null; 
let allExpenses = [];
let allNotifications = [];

// دالة مساعدة لتقريب الأرقام لضمان دقة الحسابات
function roundToTwo(num) { 
    return Math.round(num * 100) / 100; 
}

// دالة التحقق من المصادقة (Auth) وتحميل البيانات (Load Data)
onAuthStateChanged(auth, (user) => {
    if (user) {
        currentUserID = user.uid;
        loadData(); // تحميل البيانات فور تسجيل الدخول
        
        // ربط زر تسجيل الخروج (إذا كان موجوداً في الصفحة)
        const logoutBtn = document.getElementById('logoutButton');
        if (logoutBtn) logoutBtn.onclick = () => auth.signOut().then(() => window.location.href = 'auth.html');
    } else {
        // إعادة التوجيه لصفحة الدخول
        if (!window.location.href.includes('auth.html')) {
            window.location.href = 'auth.html';
        }
    }
});

// دالة تحميل البيانات الرئيسية
function loadData() {
    if (!currentUserID) return;

    // الاستماع لعقدة المستخدمين
    onValue(ref(db, 'users'), (snapshot) => {
        if (snapshot.exists()) {
            const val = snapshot.val();
            allUsers = Object.keys(val).map(k => ({uid: k, ...val[k]}));
            currentUserDB = allUsers.find(u => u.uid === currentUserID);
            
            // تحديث الواجهة عند تحميل المستخدمين
            updateHomeDisplay(); 
            populateParticipants(); 
        }
    });

    // ... (هنا ستأتي دوال تحميل المصروفات والإشعارات لاحقاً)
}
// ... (ستتبعها الدوال الأخرى في المراحل التالية)