import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../api';
import { useAuth } from '../context/AuthContext.jsx';
import PostCard from '../components/PostCard.jsx';

export default function Profile() {
  const { username } = useParams();
  const { user: me, setUser } = useAuth();
  const navigate = useNavigate();
  const [profile, setProfile] = useState(null);
  const [posts, setPosts] = useState([]);
  const [bioDraft, setBioDraft] = useState('');
  const [editing, setEditing] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    api.get(`/users/${username}`)
      .then(res => {
        setProfile(res.data.user);
        setBioDraft(res.data.user.bio || '');
        return api.get(`/posts/user/${res.data.user.id}`);
      })
      .then(res => setPosts(res.data.posts))
      .finally(() => setLoading(false));
  }, [username]);

  async function toggleFollow() {
    if (profile.isFollowing) {
      await api.delete(`/users/${profile.id}/follow`);
      setProfile({ ...profile, isFollowing: false, followerCount: profile.followerCount - 1 });
    } else {
      await api.post(`/users/${profile.id}/follow`);
      setProfile({ ...profile, isFollowing: true, followerCount: profile.followerCount + 1 });
    }
  }

  async function saveBio() {
    const res = await api.put('/users/me/update', { bio: bioDraft });
    setProfile({ ...profile, bio: res.data.user.bio });
    setUser({ ...me, bio: res.data.user.bio });
    setEditing(false);
  }

  function handleDelete(id) {
    setPosts(posts.filter(p => p.id !== id));
  }

  if (loading) return <p className="muted">Loading profile...</p>;
  if (!profile) return <p className="muted">User not found.</p>;

  return (
    <div className="profile">
      <div className="profile-header">
        <h1>{profile.username}</h1>
        {profile.isSelf ? (
          editing ? (
            <div className="bio-edit">
              <textarea value={bioDraft} onChange={e => setBioDraft(e.target.value)} />
              <button onClick={saveBio}>Save</button>
              <button onClick={() => setEditing(false)}>Cancel</button>
            </div>
          ) : (
            <>
              <p>{profile.bio || 'No bio yet.'}</p>
              <button onClick={() => setEditing(true)}>Edit bio</button>
            </>
          )
        ) : (
          <>
            <p>{profile.bio || 'No bio yet.'}</p>
            <button onClick={toggleFollow}>
              {profile.isFollowing ? 'Unfollow' : 'Follow'}
            </button>
            <button onClick={() => navigate(`/messages/${profile.id}`)}>Message</button>
          </>
        )}
        <div className="profile-stats">
          <span><strong>{profile.postCount}</strong> posts</span>
          <span><strong>{profile.followerCount}</strong> followers</span>
          <span><strong>{profile.followingCount}</strong> following</span>
        </div>
      </div>

      <div className="profile-posts">
        {posts.length === 0 ? (
          <p className="muted">No posts yet.</p>
        ) : (
          posts.map(post => (
            <PostCard
              key={post.id}
              post={post}
              onDelete={profile.isSelf ? handleDelete : undefined}
            />
          ))
        )}
      </div>
    </div>
  );
}
