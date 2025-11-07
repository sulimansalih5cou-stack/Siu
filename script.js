// 🔥 1. تهيئة واستيراد Firebase SDK
import { initializeApp } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-app.js";
import { getAnalytics } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-analytics.js";
import { getDatabase, ref, onValue, set, push } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-database.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-auth.js";

// Your web app's Firebase configuration
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

// تهيئة Firebase
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);
const db = getDatabase(app); 
const auth = getAuth(app); // جلب خدمة المصادقة

// 💾 2. هيكلة البيانات والمتغيرات الأساسية
let allUsers = []; 
let expenses = []; 
let currentUserID = null; 
let currentUserName = null; 
let currentUserDB = null; 

// ⚙️ 3. وظائف تحديث الواجهة والـ DOM والتنسيق

function formatNumber(input) {
    let value = input.value.replace(/,/g, '');
    if (!isNaN(value) && value !== '') {
        input.value = parseFloat(value).toLocaleString('en-US'); 
    }
}

function updateBalanceDisplay() {
    if (!currentUserDB || !currentUserName) return;

    const balanceCard = document.getElementById('currentBalanceCard');
    const balanceTitle = balanceCard.querySelector('h3');
    const balanceElement = document.getElementById('currentBalance');

    // 💡 استخدام اسم المستخدم في العنوان
    balanceTitle.innerHTML = `<i class="fas fa-user-circle icon"></i> رصيدك الحالي يا **${currentUserName}**`;

    const balanceValue = currentUserDB.balance;
    const sign = balanceValue >= 0 ? '+' : '';
    const formattedBalance = sign + Math.abs(balanceValue).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

    balanceElement.textContent = formattedBalance;

    balanceCard.classList.remove('negative');
    balanceCard.style.background = 'linear-gradient(135deg, #10B981 0%, #059669 100%)';
    if (balanceValue < 0) {
        balanceCard.classList.add('negative');
    }
}

function populateParticipants() {
    const participantsContainer = document.getElementById('participantsCheckboxes');
    participantsContainer.innerHTML = '';

    allUsers.filter(u => u.uid !== currentUserID).forEach(user => {
        const label = document.createElement('label');
        label.className = 'checkbox-item';
        label.innerHTML = `
            <input type="checkbox" data-user-id="${user.uid}" value="${user.displayName}">
            <i class="fas fa-user"></i> ${user.displayName}
        `;
        participantsContainer.appendChild(label);
    });
}

function selectAllParticipants() {
    const checkboxes = document.querySelectorAll('#participantsCheckboxes input[type="checkbox"]');
    checkboxes.forEach(cb => cb.checked = true);
}

// 📝 4. منطق قراءة وكتابة البيانات عبر Firebase

function loadDataFromFirebase() {
    if (!currentUserID) return; 

    // الاستماع لتغييرات المستخدمين (الأرصدة)
    onValue(ref(db, 'users'), (snapshot) => {
        if (snapshot.exists()) {
            const usersObject = snapshot.val();
            // تحويل البيانات من كائن إلى مصفوفة (مع UID كـ key)
            allUsers = Object.keys(usersObject).map(uid => ({ 
                uid: uid,
                ...usersObject[uid]
            }));
            
            currentUserDB = allUsers.find(u => u.uid === currentUserID);

            // تحديث الواجهة
            populateParticipants();
            updateBalanceDisplay();
        }
    });

    // الاستماع لتغييرات المصروفات
    onValue(ref(db, 'expenses'), (snapshot) => {
        if (snapshot.exists()) {
            const expensesObject = snapshot.val();
            expenses = Object.keys(expensesObject).map(key => ({ 
                firebaseId: key,
                ...expensesObject[key] 
            }));
        } else {
             expenses = [];
        }
    });
}

async function saveExpense() {
    if (!currentUserID || !currentUserDB) return;

    const title = document.getElementById('expenseTitle').value;
    const amount = parseFloat(document.getElementById('expenseAmount').value.replace(/,/g, ''));

    const participantUIDs = Array.from(
        document.querySelectorAll('#participantsCheckboxes input[type="checkbox"]:checked')
    ).map(cb => cb.getAttribute('data-user-id'));

    participantUIDs.push(currentUserID); 

    const totalParticipants = participantUIDs.length;
    const share = amount / totalParticipants;

    const usersUpdate = {};

    allUsers.forEach(user => {
        let newBalance = user.balance;

        if (user.uid === currentUserID) {
            const netPaidForOthers = amount - share;
            newBalance += netPaidForOthers;
        } else if (participantUIDs.includes(user.uid)) {
            newBalance -= share;
        }

        // إعداد البيانات للكتابة إلى Firebase
        usersUpdate[user.uid] = {
            displayName: user.displayName, 
            balance: parseFloat(newBalance.toFixed(2)), 
        };
    });

    const newExpense = {
        title,
        amount: parseFloat(amount.toFixed(2)),
        payer_id: currentUserID, 
        participants_ids: participantUIDs,
        share: parseFloat(share.toFixed(2)),
        date: new Date().toISOString().split('T')[0]
    };

    try {
        // تحديث جميع المستخدمين في الـ 'users'
        await set(ref(db, 'users'), usersUpdate);
        // إضافة المصروف الجديد في الـ 'expenses'
        await push(ref(db, 'expenses'), newExpense);

        hideModal();
        showNotification();
        document.getElementById('expenseForm').reset();
        document.querySelectorAll('#participantsCheckboxes input[type="checkbox"]').forEach(cb => cb.checked = false);

    } catch (error) {
        alert("فشل في حفظ البيانات إلى Firebase: " + error.message);
        console.error(error);
    }
}

// 5. وظائف المعاينة والـ Modal

function previewExpense() {
    if (!currentUserDB) return;

    const title = document.getElementById('expenseTitle').value;
    const amount = parseFloat(document.getElementById('expenseAmount').value.replace(/,/g, ''));

    const selectedParticipantUIDs = Array.from(
        document.querySelectorAll('#participantsCheckboxes input[type="checkbox"]:checked')
    ).map(cb => cb.getAttribute('data-user-id'));

    if (!title || isNaN(amount) || amount <= 0) {
        alert('يرجى ملء اسم المصروف وإدخال مبلغ صحيح!');
        return;
    }

    const totalParticipants = selectedParticipantUIDs.length + 1; 
    const share = amount / totalParticipants;

    const netPaidForOthers = amount - share;
    const projectedNewBalance = currentUserDB.balance + netPaidForOthers;

    // 💡 استخدام displayName للمشاركين
    const participantNames = selectedParticipantUIDs
        .map(uid => allUsers.find(u => u.uid === uid).displayName)
        .join(', ');

    const previewText = `
        <strong>المصروف:</strong> ${title}<br>
        <strong>المبلغ الكلي:</strong> ${amount.toLocaleString('en-US')}<br>
        <strong>المشاركون (بالإضافة إليك):</strong> ${participantNames || 'أنت فقط'}<br>
        <strong>نصيب كل شخص:</strong> ${share.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}<br>
        <hr style="margin: 10px 0;">
        <span class="text-blue-600 font-bold">رصيدك بعد العملية: ${projectedNewBalance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
    `;
    document.getElementById('previewText').innerHTML = previewText;

    const today = new Date().toISOString().split('T')[0];
    const hasTodayExpense = expenses.some(e => e.payer_id === currentUserID && e.date === today && e.title === title);
    document.getElementById('warning').style.display = hasTodayExpense ? 'block' : 'none';

    document.getElementById('previewModal').classList.add('show');
}

function hideModal() {
    document.getElementById('previewModal').classList.remove('show');
}

function showNotification() {
    const notif = document.getElementById('notification');
    notif.style.display = 'block';
    setTimeout(() => notif.style.display = 'none', 4000);
}

// 6. مراقبة حالة المصادقة (Auth State) وتجهيز البيانات
onAuthStateChanged(auth, (user) => {
    if (user) {
        // المستخدم مسجل الدخول
        currentUserID = user.uid;
        currentUserName = user.displayName; // جلب اسم المستخدم من Firebase Auth
        
        loadDataFromFirebase(); // بدء تحميل بيانات الـ DB
        
        // *تعديل زر تسجيل الخروج*
        document.getElementById('logoutButton').onclick = (e) => {
             e.preventDefault();
             auth.signOut().then(() => {
                window.location.href = 'auth.html'; // التوجيه لصفحة الدخول
             });
        }
        
    } else {
        // لا يوجد مستخدم مسجل الدخول، توجيهه لصفحة الدخول
        window.location.href = 'auth.html'; 
    }
});

// *إتاحة الدوال للـ HTML*
window.formatNumber = formatNumber;
window.selectAllParticipants = selectAllParticipants;
window.previewExpense = previewExpense;
window.saveExpense = saveExpense;
window.hideModal = hideModal;
