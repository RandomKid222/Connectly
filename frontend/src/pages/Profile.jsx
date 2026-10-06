import React, { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../api';
import { useAuth } from '../context/AuthContext.jsx';
import PostCard from '../components/PostCard.jsx';
import Avatar from '../components/Avatar.jsx';
import PostComposer from '../components/PostComposer.jsx';
import LocalTime from '../components/LocalTime.jsx';
import Icon from '../components/Icon.jsx';
import VerifiedBadge from '../components/VerifiedBadge.jsx';

export default function Profile() {
  const { username } = useParams();
  const { user: me, setUser } = useAuth();
  const navigate = useNavigate();
  const [profile, setProfile] = useState(null);
  const [posts, setPosts] = useState([]);
  const [bioDraft, setBioDraft] = useState('');
  const [editing, setEditing] = useState(false);
  const [bioBusy, setBioBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [avatarBusy, setAvatarBusy] = useState(false);
  const [avatarError, setAvatarError] = useState('');
  const [followBusy, setFollowBusy] = useState(false);
  const [followList, setFollowList] = useState(null);
  const [followListError, setFollowListError] = useState('');
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
    setFollowList(null);
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
    if (followBusy) return;
    setFollowBusy(true);
    setAvatarError('');
    try {
    if (profile.isFollowing || profile.followRequested) {
      await api.delete(`/users/${profile.id}/follow`);
      profileMutation.current += 1;
      setProfile(current => ({ ...current, isFollowing: false, followRequested: false,
        followerCount: current.isFollowing && current.followerCount !== null ? current.followerCount - 1 : current.followerCount }));
    } else {
      const response = await api.post(`/users/${profile.id}/follow`);
      profileMutation.current += 1;
      setProfile(current => ({ ...current, isFollowing: response.data.following, followRequested: response.data.requested,
        followerCount: response.data.following && current.followerCount !== null ? current.followerCount + 1 : current.followerCount }));
    }
    const refreshed = await api.get('/users/' + username);
    setProfile(refreshed.data.user);
    const postResult = await api.get('/posts/user/' + refreshed.data.user.id);
    setPosts(postResult.data.posts);
    } catch (error) { setAvatarError(error.response?.data?.error || 'Could not update the follow.'); }
    finally { setFollowBusy(false); }
  }

  async function saveBio() {
    if (bioBusy) return;
    setBioBusy(true); setAvatarError('');
    try {
    const res = await api.put('/users/me/update', { bio: bioDraft });
    profileMutation.current += 1;
    setProfile(current => ({ ...current, bio: res.data.user.bio }));
    setUser(current => ({ ...current, bio: res.data.user.bio }));
    setEditing(false);
    } catch (error) { setAvatarError(error.response?.data?.error || 'Could not save your bio. Please try again.'); }
    finally { setBioBusy(false); }
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
    setProfile(current => ({ ...current, postCount: Math.max(0, current.postCount - 1) }));
  }

  function posted(post) {
    profileMutation.current += 1;
    setPosts(current => [post, ...current.filter(item => item.id !== post.id)]);
    setProfile(current => ({ ...current, postCount: current.postCount + 1 }));
  }
  async function showFollowList(direction) {
    setFollowListError('');
    try {
      const response = await api.get('/users/' + profile.id + '/' + direction);
      setFollowList({ direction, users: response.data[direction] });
    } catch (error) { setFollowListError(error.response?.data?.error || 'Could not load this list.'); }
  }

  if (loading) return <p className="muted">Loading profile...</p>;
  if (!profile) return <p className="muted">{loadError || 'User not found.'}</p>;

  return (
    <div className="profile">
      <div className="profile-header">
        <div className="profile-cover" aria-hidden="true"><img src="/favicon.svg" alt="" /><span>Stay close, stay connected.</span></div>
        <div className="profile-content">
        <div className="profile-identity">
          <Avatar url={profile.avatar_url} username={profile.username} className="profile-avatar" />
          <div>
            <h1>{profile.username}<VerifiedBadge verified={profile.is_verified} /></h1>
            <span className="profile-handle">@{profile.username}</span>
            <p className="muted">Joined <LocalTime value={profile.created_at} /></p>
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
              <textarea aria-label="Your bio" maxLength={5000} value={bioDraft} disabled={bioBusy} onChange={e => setBioDraft(e.target.value)} />
              <button onClick={saveBio} disabled={bioBusy}>{bioBusy ? 'Saving...' : 'Save'}</button>
              <button onClick={() => setEditing(false)} disabled={bioBusy}>Cancel</button>
            </div>
          ) : (
            <>
              <p>{profile.bio || 'No bio yet.'}</p>
              <button onClick={() => setEditing(true)}>Edit bio</button>
            </>
          )
        ) : (
          <>
            <p>{profile.canViewPosts ? profile.bio || 'No bio yet.' : 'Private profile. Request to follow to see their threads.'}</p>
            <button onClick={toggleFollow} disabled={followBusy}>
              {followBusy ? 'Saving...' : profile.isFollowing ? 'Unfollow' : profile.followRequested ? 'Cancel request' :
                profile.profile_visibility === 'private' ? 'Request to follow' : 'Follow'}
            </button>
            {profile.canMessage && <button onClick={() => navigate(`/messages/${profile.id}`)}>Message</button>}
          </>
        )}
        {profile.profile_visibility === 'private' && <span className="privacy-badge"><Icon name="lock" size={14} />Private profile</span>}
        {profile.canViewPosts && <div className="profile-stats">
          <span><strong>{profile.postCount}</strong> threads</span>
          <button type="button" className="stat-button" onClick={() => showFollowList('followers')}><strong>{profile.followerCount}</strong> followers</button>
          <button type="button" className="stat-button" onClick={() => showFollowList('following')}><strong>{profile.followingCount}</strong> following</button>
        </div>}
        {followListError && <p className="error" role="alert">{followListError}</p>}
        {followList && <section className="follow-list" aria-label={followList.direction}>
          <div><strong>{followList.direction === 'followers' ? 'Followers' : 'Following'}</strong>
            <button type="button" onClick={() => setFollowList(null)}>Close</button></div>
          {!followList.users.length && <p className="muted">No members yet.</p>}
          {followList.users.map(person => <button type="button" key={person.id} onClick={() => navigate('/profile/' + person.username)}>
            <Avatar url={person.avatar_url} username={person.username} /> {person.username}<VerifiedBadge verified={person.is_verified} />
          </button>)}
        </section>}
        </div>
      </div>
      {profile.isSelf && <PostComposer onPosted={posted} />}

      <div className="profile-posts">
        <div className="section-heading"><h2>Threads</h2><Icon name="message" size={20} /></div>
        {!profile.canViewPosts ? <p className="muted">This member shares threads with approved followers.</p> : posts.length === 0 ? (
          <p className="muted">No threads yet.</p>
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
