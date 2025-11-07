// 💡 دالة الحفظ الرئيسية (المصححة)
async function saveExpense() {
    if (document.getElementById('previewModal')) {
         hideModal();
    }

    if (!currentUserID || !currentUserDB) {
        alert("خطأ: بيانات المستخدم غير متوفرة. يرجى تسجيل الدخول مجدداً.");
        return;
    }

    const title = document.getElementById('expenseTitle').value;
    const rawAmount = document.getElementById('expenseAmount').value.replace(/,/g, '');
    const amount = parseFloat(rawAmount); 

    if (isNaN(amount) || amount <= 0) {
         return; 
    }

    const participantUIDs = Array.from(
        document.querySelectorAll('#participantsCheckboxes input[type="checkbox"]:checked')
    ).map(cb => cb.getAttribute('data-user-id'));

    // 🛑 نضمن أن الدافع (currentUserID) يكون دائماً مشاركاً في المصروف
    if (!participantUIDs.includes(currentUserID)) {
        participantUIDs.push(currentUserID); 
    }

    const totalParticipants = participantUIDs.length;
    const share = amount / totalParticipants;

    const usersUpdate = {};

    allUsers.forEach(user => {
        let oldBalance = user.balance || 0; 
        let newBalance = oldBalance;

        // 1. حساب الدافع (Payer) - التعديل هنا لضمان الوضوح والدقة
        if (user.uid === currentUserID) {
            // الدافع يدفع المبلغ كاملاً (Amount)، ولكنه مدين لنفسه بحصته (Share)
            // الفرق هو المبلغ الذي سيدخل رصيده كدين له من الآخرين.
            const netAmountOwedToPayer = amount - share; 
            newBalance = parseFloat((oldBalance + netAmountOwedToPayer).toFixed(2));
        } 
        // 2. حساب المشاركين الآخرين (Participant)
        else if (participantUIDs.includes(user.uid)) {
            // المشارك ينقص من رصيده حصته التي دفعها عنه الدافع
            newBalance = parseFloat((oldBalance - share).toFixed(2));
        }
        // 3. المستخدمون غير المشاركين لا تتغير أرصدتهم

        usersUpdate[user.uid] = {
            displayName: user.displayName, 
            balance: newBalance,
        };
    });

    const newExpense = {
        title: title,
        amount: amount,
        payer_id: currentUserID, 
        participants_ids: participantUIDs,
        share: parseFloat(share.toFixed(2)),
        date: new Date().toISOString().split('T')[0], 
        timestamp: Date.now() 
    };

    try {
        await set(ref(db, 'users'), usersUpdate);
        await push(ref(db, 'expenses'), newExpense);

        if (document.getElementById('expenseForm')) {
             const successModal = document.getElementById('successModal');
             if (successModal) showSuccessModal(); 

             document.getElementById('expenseForm').reset();
             document.querySelectorAll('#participantsCheckboxes input[type="checkbox"]').forEach(cb => cb.checked = false);
        }

    } catch (error) {
        alert("فشل في حفظ البيانات إلى Firebase. تأكد من اتصالك وقواعد الأمان.");
        console.error("Firebase Save Error:", error);
    }
}