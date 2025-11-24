// 🔥 1. تهيئة واستيراد Firebase SDK
import { initializeApp } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-app.js";
import { getDatabase, ref, onValue, set, push } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-database.js";
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

let allUsers = []; 
let allExpenses = []; // تخزين كل المصروفات هنا
let currentUserID = null; 
let activeFilter = '30days'; // الفلتر الافتراضي

// -------------------------------------------------------
// 🛠️ دوال مساعدة
// -------------------------------------------------------

function getUserNameById(uid) {
    const user = allUsers.find(u => u.uid === uid);
    return user ? user.displayName : 'مستخدم';
}

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

// دالة التحكم في الفلاتر (متاحة للـ HTML)
window.setFilter = function(filterType, element) {
    activeFilter = filterType;
    
    // تحديث شكل الأزرار
    document.querySelectorAll('.filter-pill').forEach(btn => btn.classList.remove('active'));
    element.classList.add('active');

    // إعادة عرض البيانات
    displayHistory();
}

// -------------------------------------------------------
// 🔄 جلب البيانات
// -------------------------------------------------------
function loadDataFromFirebase() {
    if (!currentUserID) return; 

    onValue(ref(db, 'users'), (snapshot) => {
        if (snapshot.exists()) {
            const usersObject = snapshot.val();
            allUsers = Object.keys(usersObject).map(uid => ({ uid, ...usersObject[uid] }));
        }
    });

    onValue(ref(db, 'expenses'), (snapshot) => {
        if (snapshot.exists()) {
            const expensesObject = snapshot.val();
            allExpenses = Object.keys(expensesObject)
                .map(key => ({ firebaseId: key, ...expensesObject[key] }))
                .sort((a, b) => b.timestamp - a.timestamp);
            
            displayHistory();
        } else {
            allExpenses = [];
            displayHistory();
        }
    });
}

// -------------------------------------------------------
// 🎨 عرض السجل
// -------------------------------------------------------
function displayHistory() {
    const container = document.getElementById('expensesContainer');
    if (!container) return;
    container.innerHTML = ''; 

    // 1. تطبيق الفلاتر
    const now = Date.now();
    const oneDay = 24 * 60 * 60 * 1000;
    
    let filteredList = allExpenses.filter(expense => {
        const isPayer = expense.payer_id === currentUserID;
        const isParticipant = expense.participants_ids.includes(currentUserID);
        if (!isPayer && !isParticipant) return false; // تصفية من لا علاقة لهم

        // منطق الفلترة الزمنية والنوعية
        if (activeFilter === '30days') return (now - expense.timestamp) <= (30 * oneDay);
        if (activeFilter === '3months') return (now - expense.timestamp) <= (90 * oneDay);
        if (activeFilter === 'incoming') return isPayer; // واردة = أنت دفعت (رصيد لك)
        if (activeFilter === 'outgoing') return !isPayer; // صادرة = عليك دفع (دين عليك)
        
        return true; // 'all'
    });

    if (filteredList.length === 0) {
        container.innerHTML = '<p class="text-center text-gray-500 mt-10">لا توجد سجلات لهذا التصنيف.</p>';
        return;
    }

    // 2. رسم البطاقات
    filteredList.forEach(expense => {
        const isPayer = expense.payer_id === currentUserID;
        const share = expense.share;
        let netAmount = 0;
        let isPositive = false;

        let mainTitle = "";
        let detailsText = "";

        if (isPayer) {
            netAmount = expense.amount - share;
            isPositive = true;
            mainTitle = `تحويل نقدي (أنت الدافع)`;
            detailsText = `المبلغ الكلي: ${expense.amount.toLocaleString('en-US')} SDG`;
        } else {
            netAmount = share;
            isPositive = false;
            const payerName = getUserNameById(expense.payer_id);
            mainTitle = `مشاركة (دفع: ${payerName})`;
            detailsText = `حصتك المطلوبة`;
        }

        const colorClass = isPositive ? "amount-pos" : "amount-neg";
        const sign = isPositive ? "+" : "-";
        const iconClass = isPositive ? "icon-success" : "icon-danger";
        const arrowIcon = isPositive ? "fa-arrow-down" : "fa-arrow-up";
        const { date, time } = formatBankDate(expense.timestamp);

        const cardHTML = `
        <div class="bankak-card">
            
            <div class="card-main-content">
                
                <div class="amount-display ${colorClass}">
                    ${sign} ${netAmount.toLocaleString('en-US', {minimumFractionDigits: 1})}
                </div>

                <div class="details-wrapper">
                    
                    <div class="bank-icon-container ${iconClass} ml-3">
                        <span class="font-bold text-xs">ج.س</span>
                        <div class="arrow-badge ${isPositive ? 'text-green-600' : 'text-red-600'}">
                            <i class="fas ${arrowIcon}"></i>
                        </div>
                    </div>

                    <div class="details-text text-right">
                        <p class="transaction-title">${expense.title}</p>
                        <p class="transaction-sub">
                            ${mainTitle}<br>
                            <span class="text-xs opacity-80">${detailsText}</span>
                        </p>
                    </div>
                </div>

            </div>

            <div class="card-footer-date">
                <span><i class="far fa-calendar-alt ml-1"></i> ${date}</span>
                <span><i class="far fa-clock ml-1"></i> ${time}</span>
            </div>

        </div>
        `;
        container.innerHTML += cardHTML;
    });
}

// -------------------------------------------------------
// 🔐 المصادقة
// -------------------------------------------------------
onAuthStateChanged(auth, (user) => {
    if (user) {
        currentUserID = user.uid;
        document.getElementById('displayHeaderName').textContent = user.displayName || 'مستخدم';
        document.getElementById('displayHeaderEmail').textContent = user.email || '';
        loadDataFromFirebase();
    } else {
        window.location.href = 'auth.html';
    }
});
