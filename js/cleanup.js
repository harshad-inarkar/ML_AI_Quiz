/**
 * Admin utility to scan the Realtime Database and remove orphaned records 
 * (scores, quiz_states, usernames) that belong to deleted users.
 */
async function runClientCleanup() {
    if (!confirm("Run database cleanup?\n\nThis will scan and remove orphaned DB records belonging to deleted users.")) return;
    
    const db = firebase.database();
    try {
        console.log("Starting DB Cleanup...");
        
        // 1. Fetch all relevant tables globally (Requires Admin Rules)
        const [usersSnap, usernamesSnap, scoresSnap, statesSnap] = await Promise.all([
            db.ref('users').once('value'),
            db.ref('usernames').once('value'),
            db.ref('scores').once('value'),
            db.ref('quiz_states').once('value')
        ]);

        const users = usersSnap.val() || {};
        const usernames = usernamesSnap.val() || {};
        const scores = scoresSnap.val() || {};
        const states = statesSnap.val() || {};

        const validUids = new Set(Object.keys(users));
        let deletedCount = 0;
        const updates = {}; // We will perform a single atomic multi-path update

        // 2. Scan for orphaned usernames
        for (const [uname, uid] of Object.entries(usernames)) {
            if (!validUids.has(uid)) {
                updates[`usernames/${uname}`] = null;
                deletedCount++;
            }
        }
        
        // 3. Scan for orphaned scores
        for (const uid of Object.keys(scores)) {
            if (!validUids.has(uid)) {
                updates[`scores/${uid}`] = null;
                deletedCount++;
            }
        }
        
        // 4. Scan for orphaned quiz states
        for (const uid of Object.keys(states)) {
            if (!validUids.has(uid)) {
                updates[`quiz_states/${uid}`] = null;
                deletedCount++;
            }
        }

        // 5. Execute deletion
        if (deletedCount > 0) {
            await db.ref().update(updates);
            alert(`✅ Cleanup complete!\n\nRemoved ${deletedCount} orphaned records from the database.`);
        } else {
            alert("✅ Database is clean.\n\nNo orphaned records found.");
        }

    } catch (e) {
        alert("Cleanup failed. Ensure Admin database rules are applied. Error: " + e.message);
        console.error(e);
    }
}

// Make globally available for the inline onclick handler
window.runClientCleanup = runClientCleanup;