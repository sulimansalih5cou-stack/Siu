// 🔥 1. تهيئة واستيراد Firebase SDK
import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
import { getDatabase, ref, onValue, set, push } from "firebase/database";

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

// 💾 2. هيكلة البيانات والمتغيرات الأساسية
let allUsers = []; 
let expenses = []; 

// ID للمستخدم الحالي (لنفترض أنه خالد - ID: 1)
// 💡 ملاحظة: يجب تعديل هذا ليقرأ من sessionStorage بعد تسجيل الدخول
const currentUserID = 1; 
let currentUser = null;


// ⚙️ 3. وظائف تحديث الواجهة والـ DOM والتنسيق

// وظيفة لتنسيق الرقم في حقل الإدخال
function formatNumber(input) {
    let value = input.value.replace(/,/g, '');
    if (!isNaN(value) && value !== '') {
        // استخدام toLocaleString('en-US') لإضافة فاصلة الآلاف
        input.value = parseFloat(value).toLocaleString('en-US'); 
    }
}

function updateBalanceDisplay() {
    if (!currentUser) return;
    
    const balanceCard = document.getElementById('currentBalanceCard');
    const balanceElement = document.getElementById('currentBalance');
    
    const balanceValue = currentUser.balance;
    const sign = balanceValue >= 0 ? '+' : '';
    // استخدام toLocaleString لتنسيق الرصيد مع الفواصل العشرية
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
    
    allUsers.filter(u => u.id !== currentUserID).forEach(user => {
        const label = document.createElement('label');
        label.className = 'checkbox-item';
        label.innerHTML = `
            <input type="checkbox" data-user-id="${user.id}" value="${user.name}">
            <i class="fas fa-user"></i> ${user.name}
        `;
        participantsContainer.appendChild(label);
    });
}

function selectAllParticipants() {
    const checkboxes = document.querySelectorAll('#participantsCheckboxes input[type="checkbox"]');
    checkboxes.forEach(cb => cb.checked = true);
}

// 📝 4. منطق قراءة وكتابة البيانات عبر Firebase

// وظيفة قراءة البيانات الأولية من Firebase
function loadDataFromFirebase() {
    // الاستماع لتغييرات المستخدمين (الأرصدة)
    onValue(ref(db, 'users'), (snapshot) => {
        if (snapshot.exists()) {
            const usersObject = snapshot.val();
            // تحويل البيانات من كائن إلى مصفوفة
            allUsers = Object.keys(usersObject).map(key => usersObject[key]);
            currentUser = allUsers.find(u => u.id === currentUserID);
            
            // تحديث الواجهة بعد تحميل البيانات
            populateParticipants();
            updateBalanceDisplay();
        }
    });

    // الاستماع لتغييرات المصروفات (سجل المصروفات)
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

// وظيفة حفظ المصروف وتحديث الأرصدة في Firebase
async function saveExpense() {
    // 💡 إزالة الفواصل الألفية قبل التحويل إلى رقم لضمان دقة الحسابات
    const title = document.getElementById('expenseTitle').value;
    const amount = parseFloat(document.getElementById('expenseAmount').value.replace(/,/g, ''));

    const participantIDs = Array.from(
        document.querySelectorAll('#participantsCheckboxes input[type="checkbox"]:checked')
    ).map(cb => parseInt(cb.getAttribute('data-user-id')));
    
    participantIDs.push(currentUserID); 
    
    const totalParticipants = participantIDs.length;
    const share = amount / totalParticipants;

    // 1. تحديث الأرصدة في الذاكرة
    const usersUpdate = {};
    
    allUsers.forEach(user => {
        let newBalance = user.balance;

        if (user.id === currentUserID) {
            const netPaidForOthers = amount - share;
            newBalance += netPaidForOthers;
        } else if (participantIDs.includes(user.id)) {
            newBalance -= share;
        }

        // إعداد البيانات للكتابة إلى Firebase
        usersUpdate[user.id] = {
            ...user, 
            balance: parseFloat(newBalance.toFixed(2)), // حفظ مع تقريب
        };
    });

    // 2. إعداد المصروف الجديد
    const newExpense = {
        title,
        amount: parseFloat(amount.toFixed(2)),
        payer_id: currentUserID,
        participants_ids: participantIDs,
        share: parseFloat(share.toFixed(2)),
        date: new Date().toISOString().split('T')[0]
    };

    // 3. كتابة التحديثات إلى Firebase 
    try {
        await set(ref(db, 'users'), usersUpdate);
        await push(ref(db, 'expenses'), newExpense);

        hideModal();
        showNotification();

        // إعادة تعيين النموذج
        document.getElementById('expenseForm').reset();
        document.querySelectorAll('#participantsCheckboxes input[type="checkbox"]').forEach(cb => cb.checked = false);

    } catch (error) {
        alert("فشل في حفظ البيانات إلى Firebase: " + error.message);
        console.error(error);
    }
}

// 5. وظائف المعاينة والـ Modal

function previewExpense() {
    const title = document.getElementById('expenseTitle').value;
    // 💡 إزالة الفواصل قبل التحويل إلى رقم
    const amount = parseFloat(document.getElementById('expenseAmount').value.replace(/,/g, ''));
    
    const selectedParticipantIDs = Array.from(
        document.querySelectorAll('#participantsCheckboxes input[type="checkbox"]:checked')
    ).map(cb => parseInt(cb.getAttribute('data-user-id')));

    if (!title || isNaN(amount) || amount <= 0) {
        alert('يرجى ملء اسم المصروف وإدخال مبلغ صحيح!');
        return;
    }

    const totalParticipants = selectedParticipantIDs.length + 1; 
    const share = amount / totalParticipants;
    
    const netPaidForOthers = amount - share;
    const projectedNewBalance = currentUser.balance + netPaidForOthers;

    const participantNames = selectedParticipantIDs
        .map(id => allUsers.find(u => u.id === id).name)
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

// تنفيذ الدوال الأولية عند تحميل الصفحة
window.onload = () => {
    loadDataFromFirebase();
};
