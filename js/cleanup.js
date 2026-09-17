/**
 * Admin utility to scan the Realtime Database and remove orphaned records.
 * Performs Strict Two-Way Validation between 'users' and 'usernames'.
 */
async function runClientCleanup() {
    if (!confirm("Run strict database cleanup?\n\nThis will scan for mismatches between users and usernames, and permanently remove all dangling/orphaned records.")) return;
    
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

        const users = usersSnap.val();
        
        // --- STRICT SAFETY CHECK ---
        if (!users || Object.keys(users).length === 0) {
            alert("⚠️ SAFETY ABORT: Could not read the 'users' node, or it is empty. Cleanup cancelled to prevent data loss. Please check your Database Rules.");
            return;
        }

        const usernames = usernamesSnap.val() || {};
        const scores = scoresSnap.val() || {};
        const states = statesSnap.val() || {};

        const validUids = new Set();
        let deletedCount = 0;
        const updates = {}; // Atomic multi-path update

        // 2. TWO-WAY VALIDATION: Check Users against Usernames
        for (const [uid, profile] of Object.entries(users)) {
            const claimedUsername = profile.username;
            
            // If the username mapping points exactly back to this UID, it is perfectly valid
            if (claimedUsername && usernames[claimedUsername] === uid) {
                validUids.add(uid);
            } else {
                // MISMATCH: The user exists, but the username mapping is missing or points to someone else.
                console.log(`[Mismatch] Invalidating dangling user profile: ${uid}`);
                updates[`users/${uid}`] = null;
                deletedCount++;
            }
        }

        // 3. Scan for orphaned/dangling usernames
        for (const [uname, uid] of Object.entries(usernames)) {
            // If the UID this username points to wasn't validated in Step 2, wipe it.
            if (!validUids.has(uid)) {
                console.log(`[Orphan] Deleting dangling username: ${uname}`);
                updates[`usernames/${uname}`] = null;
                deletedCount++;
            }
        }
        
        // 4. Scan for orphaned scores
        for (const uid of Object.keys(scores)) {
            if (!validUids.has(uid)) {
                updates[`scores/${uid}`] = null;
                deletedCount++;
            }
        }
        
        // 5. Scan for orphaned quiz states
        for (const uid of Object.keys(states)) {
            if (!validUids.has(uid)) {
                updates[`quiz_states/${uid}`] = null;
                deletedCount++;
            }
        }

        // 6. Execute deletion safely
        if (deletedCount > 0) {
            await db.ref().update(updates);
            alert(`✅ Cleanup complete!\n\nRemoved ${deletedCount} inconsistent or orphaned records from the database.`);
        } else {
            alert("✅ Database is perfectly consistent.\n\nNo mismatched or orphaned records found.");
        }

    } catch (e) {
        alert("Cleanup failed. Ensure Admin database rules are applied. Error: " + e.message);
        console.error(e);
    }
}

// Make globally available for the inline onclick handler
window.runClientCleanup = runClientCleanup;