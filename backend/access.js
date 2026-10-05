const db = require('./db');

// The user alias in queries using this expression must be "u".
const visibleProfileSQL = "(u.profile_visibility = 'public' OR u.id = ? OR " +
  'EXISTS (SELECT 1 FROM follows allowed WHERE allowed.follower_id = ? AND allowed.following_id = u.id))';

async function canViewProfile(owner, viewerId) {
  return owner.id === viewerId || owner.profile_visibility === 'public' ||
    !!(await db.get('SELECT 1 FROM follows WHERE follower_id = ? AND following_id = ?', viewerId, owner.id));
}

async function accessiblePost(id, viewerId) {
  return db.get('SELECT p.* FROM posts p JOIN users u ON u.id = p.user_id WHERE p.id = ? AND ' +
    visibleProfileSQL, id, viewerId, viewerId);
}

async function canMessage(owner, senderId) {
  if (owner.id === senderId) return false;
  if (owner.message_permission === 'none') return false;
  if (owner.message_permission === 'following') {
    return !!(await db.get('SELECT 1 FROM follows WHERE follower_id = ? AND following_id = ?', owner.id, senderId));
  }
  return true;
}

module.exports = { visibleProfileSQL, canViewProfile, accessiblePost, canMessage };
