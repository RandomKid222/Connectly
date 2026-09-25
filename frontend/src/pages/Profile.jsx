import React, { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../api';
import { useAuth } from '../context/AuthContext.jsx';
import PostCard from '../components/PostCard.jsx';
import Avatar from '../components/Avatar.jsx';

export default function Profile() {
  const { username } = useParams();
  const { user: me, setUser } = useAuth();
  const navigate = useNavigate();
  const [profile, setProfile] = useState(null);
  const [posts, setPosts] = useState([]);
  const [bioDraft, setBioDraft] = useState('');
  const [editing, setEditing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [avatarBusy, setAvatarBusy] = useState(false);
  const [avatarError, setAvatarError] = useState('');
  const profileMutation = useRef(0);
  const avatarInput = useRef(null);

  useEffect(() => {
    let cancelled = false;
    let busy = false;
    let initial = true;
    let draftInitialized = false;
    setLoading(true);
    setProfile(null);
    setPosts([]);
    setEditing(false);
    setLoadError('');
    setAvatarError('');
    const refresh = async () => {
      if (busy) return;
      busy = true;
      const version = profileMutation.current;
      try {
        const profileRes = await api.get(`/users/${username}`);
        const postsRes = await api.get(`/posts/user/${profileRes.data.user.id}`);
        if (!cancelled && version === profileMutation.current) {
          setProfile(profileRes.data.user);
          setPosts(postsRes.data.posts);
          if (!draftInitialized) {
            setBioDraft(profileRes.data.user.bio || '');
            draftInitialized = true;
          }
          setLoadError('');
        }
      } catch {
        if (!cancelled && initial) setLoadError('Could not load this profile. Please try again shortly.');
      } finally {
        busy = false;
        if (!cancelled && initial) { initial = false; setLoading(false); }
      }
    };
    refresh();
    const onVisible = () => {
      if (document.visibilityState === 'visible') refresh();
    };
    const timer = setInterval(onVisible, 30000);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      cancelled = true;
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [username]);

  async function toggleFollow() {
    if (profile.isFollowing) {
      await api.delete(`/users/${profile.id}/follow`);
      profileMutation.current += 1;
      setProfile(current => ({ ...current, isFollowing: false, followerCount: current.followerCount - 1 }));
    } else {
      await api.post(`/users/${profile.id}/follow`);
      profileMutation.current += 1;
      setProfile(current => ({ ...current, isFollowing: true, followerCount: current.followerCount + 1 }));
    }
  }

  async function saveBio() {
    const res = await api.put('/users/me/update', { bio: bioDraft });
    profileMutation.current += 1;
    setProfile(current => ({ ...current, bio: res.data.user.bio }));
    setUser({ ...me, bio: res.data.user.bio });
    setEditing(false);
  }

  async function uploadAvatar(event) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setAvatarError('');
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      setAvatarError('Choose a JPG, PNG, or WebP image.');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setAvatarError('The image must be smaller than 5 MB.');
      return;
    }
    setAvatarBusy(true);
    try {
      const form = new FormData();
      form.append('avatar', file);
      const res = await api.post('/users/me/avatar', form);
      profileMutation.current += 1;
      setProfile(current => ({ ...current, avatar_url: res.data.user.avatar_url }));
      setUser(current => ({ ...current, avatar_url: res.data.user.avatar_url }));
    } catch (err) {
      setAvatarError(err.response?.data?.error || 'Could not upload the photo. Please try again.');
    } finally {
      setAvatarBusy(false);
    }
  }

  async function removeAvatar() {
    setAvatarBusy(true);
    setAvatarError('');
    try {
      const res = await api.delete('/users/me/avatar');
      profileMutation.current += 1;
      setProfile(current => ({ ...current, avatar_url: '' }));
      setUser(current => ({ ...current, avatar_url: res.data.user.avatar_url }));
    } catch {
      setAvatarError('Could not remove the photo. Please try again.');
    } finally {
      setAvatarBusy(false);
    }
  }

  function handleDelete(id) {
    profileMutation.current += 1;
    setPosts(current => current.filter(post => post.id !== id));
  }

  if (loading) return <p className="muted">Loading profile...</p>;
  if (!profile) return <p className="muted">{loadError || 'User not found.'}</p>;

  return (
    <div className="profile">
      <div className="profile-header">
        <div className="profile-identity">
          <Avatar url={profile.avatar_url} username={profile.username} className="profile-avatar" />
          <div>
            <h1>{profile.username}</h1>
            {profile.isSelf && (
              <div className="avatar-actions">
                <input ref={avatarInput} type="file" accept="image/jpeg,image/png,image/webp"
                  onChange={uploadAvatar} style={{ display: 'none' }} />
                <button type="button" disabled={avatarBusy} onClick={() => avatarInput.current?.click()}>
                  {avatarBusy ? 'Saving photo...' : profile.avatar_url ? 'Change photo' : 'Add photo'}
                </button>
                {profile.avatar_url && <button type="button" disabled={avatarBusy}
                  className="remove-avatar" onClick={removeAvatar}>Remove photo</button>}
              </div>
            )}
          </div>
        </div>
        {avatarError && <p className="error" role="alert">{avatarError}</p>}
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
