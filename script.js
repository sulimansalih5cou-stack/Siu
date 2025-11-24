// 🔥 1. تهيئة واستيراد Firebase SDK
import { initializeApp } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-app.js";
import { getDatabase, ref, onValue, set, push } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-database.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-auth.js";

// 🛑 إعدادات Firebase
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

// متغيرات
let allUsers = []; 
let expenses = []; 
let currentUserID = null; 

// -------------------------------------------------------
// 🛠️ دوال مساعدة
// -------------------------------------------------------

function getUserNameById(uid) {
    const user = allUsers.find(u => u.uid === uid);
    return user ? user.displayName : 'مستخدم';
}

function roundToTwo(num) {
    return Math.round(num * 100) / 100;
}

// تنسيق التاريخ مثل الصورة (17-Nov-2025)
function formatBankDate(timestamp) {
    if (!timestamp) return { date: '--', time: '--' };
    const dateObj = new Date(timestamp);
    
    const day = dateObj.getDate();
    const month = dateObj.toLocaleString('en-US', { month: 'short' });
    const year = dateObj.getFullYear();
    
    const date = `${day}-${month}-${year}`;
    const time = dateObj.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });

    return { date, time };
}

// -------------------------------------------------------
// 🔄 جلب البيانات
// -------------------------------------------------------
function loadDataFromFirebase() {
    if (!currentUserID) return; 

    // جلب المستخدمين
    onValue(ref(db, 'users'), (snapshot) => {
        if (snapshot.exists()) {
            const usersObject = snapshot.val();
            allUsers = Object.keys(usersObject).map(uid => ({ uid, ...usersObject[uid] }));
        }
    });

    // جلب المصروفات
    onValue(ref(db, 'expenses'), (snapshot) => {
        if (snapshot.exists()) {
            const expensesObject = snapshot.val();
            expenses = Object.keys(expensesObject)
                .map(key => ({ firebaseId: key, ...expensesObject[key] }))
                .sort((a, b) => b.timestamp - a.timestamp);
            
            displayHistory();
        } else {
            expenses = [];
            displayHistory();
        }
    });
}

// -------------------------------------------------------
// 🎨 عرض السجل (Bankak Layout)
// -------------------------------------------------------
function displayHistory() {
    const container = document.getElementById('expensesContainer');
    if (!container) return;
    
    container.innerHTML = ''; 

    if (expenses.length === 0) {
        container.innerHTML = '<p class="text-center text-gray-500 mt-10">لا توجد حركات مسجلة.</p>';
        return;
    }

    expenses.forEach(expense => {
        const isPayer = expense.payer_id === currentUserID;
        const isParticipant = expense.participants_ids.includes(currentUserID);

        // عرض الحركات التي تخصك فقط
        if (!isPayer && !isParticipant) return;

        // الحسابات
        const share = expense.share;
        let netAmount = 0;
        let isPositive = false;

        // نصوص وتفاصيل
        let mainTitle = ""; // مثل "تحويل نقدي"
        let detailsLine1 = ""; // التفاصيل الصغيرة
        let detailsLine2 = ""; // التفاصيل الثانية
        
        if (isPayer) {
            // أنت دفعت = أخضر (دين لك)
            netAmount = expense.amount - share;
            isPositive = true;
            mainTitle = `دفع مصاريف (أنت الدافع)`;
            detailsLine1 = `المبلغ الكلي: ${expense.amount.toLocaleString('en-US')} SDG`;
            detailsLine2 = `المشاركون: ${expense.participants_ids.length} أشخاص`;
        } else {
            // أنت مشارك = أحمر (دين عليك)
            netAmount = share;
            isPositive = false; // يظهر بالسالب
            const payerName = getUserNameById(expense.payer_id);
            mainTitle = `مشاركة في مصروف`;
            detailsLine1 = `الدافع: ${payerName}`;
            detailsLine2 = `المبلغ الكلي: ${expense.amount.toLocaleString('en-US')} SDG`;
        }

        // الألوان والأيقونات
        const colorClass = isPositive ? "amount-pos" : "amount-neg";
        const sign = isPositive ? "+" : "-";
        const iconClass = isPositive ? "icon-success" : "icon-danger";
        const arrowIcon = isPositive ? "fa-arrow-down" : "fa-arrow-up"; // سهم لأسفل (إيداع) أو لأعلى (سحب)
        
        // التاريخ
        const { date, time } = formatBankDate(expense.timestamp);

        // HTML البطاقة
        const cardHTML = `
        <div class="bankak-card">
            
            <div class="card-top-row">
                <div class="amount-display ${colorClass}">
                    ${sign} ${netAmount.toLocaleString('en-US', {minimumFractionDigits: 1})}
                </div>
                <div class="date-display">
                    ${date}
                </div>
            </div>

            <div class="card-body-row">
                
                <div class="details-section">
                    <p class="transaction-title">${expense.title}</p>
                    <p class="transaction-sub">
                        ${mainTitle}<br>
                        <span style="font-family: sans-serif;">${detailsLine1}</span><br>
                        <span class="text-xs text-gray-400">${time}</span>
                    </p>
                </div>

                <div class="bank-icon-container ${iconClass}">
                    <span class="font-bold text-xs">ج.س</span>
                    <div class="arrow-badge ${isPositive ? 'text-green-600' : 'text-red-600'}">
                        <i class="fas ${arrowIcon}"></i>
                    </div>
                </div>

            </div>
        </div>
        `;

        container.innerHTML += cardHTML;
    });
}

// -------------------------------------------------------
// 🔐 المصادقة وعرض بيانات المستخدم
// -------------------------------------------------------
onAuthStateChanged(auth, (user) => {
    if (user) {
        currentUserID = user.uid;
        
        // ✅ تحديث اسم المستخدم والبريد في الهيدر
        document.getElementById('displayHeaderName').textContent = user.displayName || 'مستخدم';
        document.getElementById('displayHeaderEmail').textContent = user.email || '';

        loadDataFromFirebase();
    } else {
        window.location.href = 'auth.html';
    }
});
