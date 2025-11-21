// ==========================================================================
// 1. FIREBASE IMPORTS & CONFIGURATION
// ==========================================================================
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAuth, signInWithPopup, GoogleAuthProvider, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { getFirestore, doc, setDoc, deleteDoc, getDoc, collection, getDocs } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyDTtg2eOY0O0c6gPazy8QJ89gjTB94utd4",
  authDomain: "mantra-music-6356c.firebaseapp.com",
  projectId: "mantra-music-6356c",
  storageBucket: "mantra-music-6356c.firebasestorage.app",
  messagingSenderId: "59461041168",
  appId: "1:59461041168:web:f0bc7c332ba878257bde95",
  measurementId: "G-FB1MH8FXTH"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const provider = new GoogleAuthProvider();

// Global Variables
let ALL_SONGS = []; 
const myMusic = new Audio();
let setMusicIndex = 0;

// --- NEW: Shuffle Global Variables ---
let isShuffleMode = false;
let shuffledQueue = []; // Will hold the randomized list of indices
let shuffleIndex = 0;   // Tracks where we are in the shuffled queue

// ==========================================================================
// 2. AUTHENTICATION & DATABASE FUNCTIONS
// ==========================================================================

function showLoginPopup() {
    const modal = document.getElementById("login-popup");
    if(modal) modal.style.display = "flex"; 
}

window.loginUser = function() {
    signInWithPopup(auth, provider)
        .then((result) => {
            console.log("Logged in as:", result.user.displayName);
            const modal = document.getElementById("login-popup");
            if(modal) modal.style.display = "none";
        })
        .catch((error) => console.error("Login Error:", error));
}

window.logoutUser = function() {
    signOut(auth)
        .then(() => {
            console.log("Logged out");
            window.location.reload(); 
        })
        .catch((error) => console.error("Logout Error:", error));
}

window.toggleLike = async function(song) {
    const user = auth.currentUser;
    const likeBtn = document.getElementById('like-btn');
    const likeSvg = likeBtn ? likeBtn.querySelector('svg') : null;

    if (!user) {
        showLoginPopup();
        return;
    }

    const songRef = doc(db, "users", user.uid, "likedSongs", song.title);
    
    try {
        const docSnap = await getDoc(songRef);
        
        if (docSnap.exists()) {
            await deleteDoc(songRef);
            if (likeSvg) likeSvg.setAttribute('fill', '#b3b3b3'); 
        } else {
            await setDoc(songRef, {
                title: song.title,
                image: song.image,
                file: song.file,
                artist: song.artist,
                addedAt: new Date()
            });
            if (likeSvg) likeSvg.setAttribute('fill', '#ff0000'); 
        }
    } catch (e) {
        console.error("Database Error:", e);
    }
}

function canPlay() {
    if (auth.currentUser) {
        return true;
    } else {
        showLoginPopup();
        return false;
    }
}

async function updatePlayerUI(song) {
    const albumArt = document.getElementById('player-art');
    const songTitle = document.getElementById('player-title');
    const likeBtn = document.getElementById('like-btn');

    albumArt.innerHTML = "";
    const img = document.createElement('img');
    img.src = song.image; 
    img.style.width = "100%";
    albumArt.appendChild(img);

    songTitle.innerHTML = `<b>${song.title}</b>`;
    
    const likeSvg = likeBtn ? likeBtn.querySelector('svg') : null;
    if(likeSvg) {
        likeSvg.setAttribute('fill', '#b3b3b3'); 
        
        const user = auth.currentUser;
        if (user) {
            const songRef = doc(db, "users", user.uid, "likedSongs", song.title); 
            try {
                const docSnap = await getDoc(songRef);
                if (docSnap.exists()) {
                    likeSvg.setAttribute('fill', '#ff0000'); 
                }
            } catch (e) {
                console.error("Error checking liked status:", e);
            }
        }
    }
}

function displaySongs(songLists, Container) {
    Container.innerHTML = "";
    songLists.forEach(song => {
      const Card = document.createElement('div');
      Card.className = "card song-card";

      Card.innerHTML = `
        <div class="card-image">
            <img src="${song.image}" alt="${song.title}">
        </div>
        <div class="card-info">
            <h4>${song.title}</h4>
            <p>${song.artist}</p>
        </div>`;

      Card.addEventListener('click', async () => { 
        if(!canPlay()) return; 

        let originalIndex = ALL_SONGS.findIndex(s => s.file === song.file); 
        
        if (originalIndex === -1) {
             myMusic.src = song.file;
             myMusic.load();
             myMusic.play();
             await updatePlayerUI(song);
             return;
        }

        setMusicIndex = originalIndex;
        
        // If shuffle is on, we need to reset the shuffle order starting from this song
        if (isShuffleMode) {
            createShuffleQueue(setMusicIndex);
        }

        myMusic.src = song.file;
        myMusic.load();
        myMusic.play();
        await updatePlayerUI(song); 
      });
      Container.appendChild(Card);
    });
}

function hideAllViews() {
    const viewport = document.querySelector('.viewport');
    const artistPage = document.querySelector('.mainArtistpg');
    const playlistView = document.getElementById('playlist-view');
    const searchView = document.getElementById('search-view');
    const likedView = document.getElementById('liked-songs-view');

    if(viewport) viewport.style.display = 'none';
    if(artistPage) artistPage.style.display = 'none';
    if(playlistView) playlistView.style.display = 'none';
    if(searchView) searchView.style.display = 'none';
    if(likedView) likedView.style.display = 'none';
}

async function loadLikedSongs() {
    const user = auth.currentUser;
    const likedSongsView = document.getElementById('liked-songs-view');
    const likedContainer = document.getElementById('liked-songs-container');
    const songCountEl = document.getElementById('liked-song-count');

    if (!user) {
        showLoginPopup();
        return;
    }

    hideAllViews();
    likedSongsView.style.display = 'flex';
    const mainContentArea = document.querySelector('.section2'); 
    if(mainContentArea) mainContentArea.scrollTop = 0;
    
    likedContainer.innerHTML = '<p class="initial-message">Loading your favorites...</p>';

    try {
        const likedSongsCol = collection(db, "users", user.uid, "likedSongs");
        const snapshot = await getDocs(likedSongsCol); 
        
        const likedSongsList = [];
        snapshot.forEach(doc => {
            likedSongsList.push(doc.data());
        });

        if (likedSongsList.length === 0) {
            likedContainer.innerHTML = '<p class="initial-message">You haven\'t liked any songs yet.</p>';
        } else {
            displaySongs(likedSongsList, likedContainer); 
        }
        
        songCountEl.textContent = `${likedSongsList.length} songs`;

    } catch (error) {
        console.error("Error fetching liked songs:", error);
        likedContainer.innerHTML = '<p class="initial-message">Error loading songs.</p>';
    }
}

onAuthStateChanged(auth, (user) => {
    const loginBtn = document.querySelector('.subscribe-profile .subscribe');
    const greet = document.getElementById('greet');
    const profilepict = document.getElementById('profilePic'); 
    
    if (user) {
        if(loginBtn) {
            loginBtn.textContent = "Log Out";
            loginBtn.onclick = window.logoutUser;
        }

        if(greet) {
            const firstName = user.displayName ? user.displayName.split(" ")[0] : "User";
            greet.innerHTML = `<b>Hi, ${firstName}</b>`;
        }

        if (user.photoURL && profilepict) {
            const createpic = document.createElement('img');
            createpic.src = user.photoURL;
            createpic.style.width = "100%";
            createpic.style.height = "100%";
            createpic.style.objectFit = "cover";
            createpic.style.borderRadius = "50%";
            profilepict.innerHTML = ""; 
            profilepict.appendChild(createpic);
        }

    } else {
        if(loginBtn) {
            loginBtn.textContent = "Login";
            loginBtn.onclick = window.loginUser;
        }
        if (profilepict) {
            profilepict.innerHTML = '<span class="material-symbols-outlined">person</span>';
        }
        const hour = new Date().getHours();
        let greetingText = "Good Evening";
        if (hour < 12) greetingText = "Good Morning";
        else if (hour < 18) greetingText = "Good Afternoon";
        if(greet) greet.innerHTML = `<b>${greetingText}</b>`;
    }
});

document.addEventListener('DOMContentLoaded', () => {
    const modal = document.getElementById("login-popup");
    const closeBtn = document.querySelector(".close-modal");
    const popupLoginBtn = document.getElementById("popup-login-btn");

    if(closeBtn && modal) {
        closeBtn.onclick = function() {
            modal.style.display = "none";
        }
    }

    if(popupLoginBtn) {
        popupLoginBtn.onclick = function() {
            window.loginUser();
            modal.style.display = "none"; 
        }
    }

    window.onclick = function(event) {
        if (event.target == modal) {
            modal.style.display = "none";
        }
    }
});

console.log("--- MANTRA MUSIC PLAYER LOADED ---");

(function initPullToRefresh() {
  const target = document.querySelector('.section2');
  if (!target) return;

  let touchStartY = 0;

  target.addEventListener('touchstart', (e) => {
    if (target.scrollTop === 0) {
      touchStartY = e.touches[0].clientY;
    } else {
      touchStartY = 0;
    }
  }, { passive: true });

  target.addEventListener('touchend', (e) => {
    if (touchStartY === 0) return;
    const touchEndY = e.changedTouches[0].clientY;
    const pullDistance = touchEndY - touchStartY;
    if (pullDistance > 120) {
      location.reload(); 
    }
    touchStartY = 0;
  }, { passive: true });
})();


// ==========================================================================
// 5. MUSIC PLAYER LOGIC 
// ==========================================================================

// --- NEW: Helper to create random queue ---
function createShuffleQueue(startIndex = 0) {
    // Create array of indices [0, 1, 2, ... length-1]
    let indices = Array.from({length: ALL_SONGS.length}, (_, i) => i);
    
    // Remove the current song so we don't play it immediately again
    indices.splice(startIndex, 1);
    
    // Fisher-Yates Shuffle Algorithm
    for (let i = indices.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [indices[i], indices[j]] = [indices[j], indices[i]];
    }
    
    // Put current song first
    shuffledQueue = [startIndex, ...indices];
    shuffleIndex = 0; // Start at the beginning of our new random list
    console.log("Shuffle Queue Created:", shuffledQueue);
}

async function getSongs() {
  try {
      const response = await fetch("./assets/songs.json");
      const data = await response.json();
      
      data.songs.forEach(song => {
        if (song.file && !song.file.includes("/")) {
             song.file = `./assets/Music/${song.file}`;
        }
      });
      
      ALL_SONGS = data.songs;
      return { songs: data.songs, artists: data.artists };
  } catch (error) {
      console.error("Error loading songs.json:", error);
      return { songs: [], artists: [] };
  }
}

async function setupMusic() {
  let isRadioMode = false;
  let currentRadioGenre = null;
  let radioQueue = []; 
  let currentRadioQueueIndex = 0;

  const { songs, artists } = await getSongs();
  
  if (songs.length === 0) {
      console.error("No songs found. Please check songs.json");
      return;
  }

  // Initial Song Setup
  myMusic.src = songs[setMusicIndex].file;

  const start = document.getElementById('play-pause');
  const next = document.getElementById('next');
  const Before = document.getElementById('previous');
  const seeker = document.getElementById('SeekBar');
  const likeBtn = document.getElementById('like-btn');
  const mainContentArea = document.querySelector('.section2'); 
  
  const searchBtn = document.getElementById('search-btn');
  const searchView = document.getElementById('search-view');
  const searchInput = document.getElementById('search-input');
  const searchResultsSongs = document.getElementById('search-results-songs');

  const likedSongsBtn = document.getElementById('liked-songs-btn');
  const likedBackBtn = document.getElementById('liked-back-btn');

  await updatePlayerUI(songs[setMusicIndex]);

  if (likeBtn) {
    likeBtn.addEventListener('click', () => {
      const currentSong = songs[setMusicIndex]; 
      window.toggleLike(currentSong);
    });
  }
  
  if (searchBtn) {
      searchBtn.addEventListener('click', (e) => {
          e.preventDefault();
          hideAllViews();
          searchView.style.display = 'flex';
          searchInput.focus();
          if(mainContentArea) mainContentArea.scrollTop = 0;
      });
  }

  let searchTimeout;
  searchInput.addEventListener('input', () => {
      clearTimeout(searchTimeout);
      searchTimeout = setTimeout(() => {
          const query = searchInput.value.toLowerCase().trim();
          
          if (query.length < 2) {
              searchResultsSongs.innerHTML = '<p class="initial-message">Start typing to see results...</p>';
              return;
          }
          
          const filteredSongs = ALL_SONGS.filter(song => 
              song.title.toLowerCase().includes(query) ||
              song.artist.toLowerCase().includes(query)
          );

          if (filteredSongs.length > 0) {
              searchResultsSongs.innerHTML = '<h2>Songs</h2>';
              displaySongs(filteredSongs, searchResultsSongs);
          } else {
              searchResultsSongs.innerHTML = '<p class="initial-message">No results found for "' + query + '".</p>';
          }
      }, 300); 
  });

  if (likedSongsBtn) {
      likedSongsBtn.addEventListener('click', (e) => {
          e.preventDefault();
          if (auth.currentUser) {
              loadLikedSongs();
          } else {
              showLoginPopup();
          }
      });
  }

  if (likedBackBtn) {
      likedBackBtn.addEventListener('click', () => {
          hideAllViews();
          document.querySelector('.viewport').style.display = 'flex'; 
          if(mainContentArea) mainContentArea.scrollTop = 0;
      });
  }
  
  const hamburgerBtn = document.querySelector('.on-media .hamburger');
  const sidebar = document.querySelector('.section1');
  const sidebarLinks = document.querySelectorAll('.section1 .nav-item a');

  if (hamburgerBtn && sidebar) {
    hamburgerBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      sidebar.classList.toggle('active');
    });
    document.addEventListener('click', (e) => {
      if (sidebar.classList.contains('active') && !sidebar.contains(e.target)) {
        sidebar.classList.remove('active');
      }
    });
    if(sidebarLinks) {
        sidebarLinks.forEach(link => {
            link.addEventListener('click', () => sidebar.classList.remove('active'));
        });
    }
  }

  const cardContainer = document.getElementById('cards');
  const randomSongs = [...songs].sort(() => 0.5 - Math.random()).slice(0, 6);
  displaySongs(randomSongs, cardContainer); 

  const viewport = document.querySelector('.viewport');
  const artistPage = document.querySelector('.mainArtistpg');
  const artistBackBtn = document.getElementById('artist-back-btn');
  const artistPic = document.querySelector('.ArtistProfilePic');
  const artistNameEl = document.querySelector('.ArtistName');
  const artistSongGrid = document.getElementById('artist-song-grid');
  const playlistView = document.getElementById('playlist-view');
  const playlistBackBtn = document.getElementById('playlist-back-btn');
  const plImg = document.getElementById('pl-img');
  const plTitle = document.getElementById('pl-title');
  const plDesc = document.getElementById('pl-desc');
  const plPlayBtn = document.getElementById('pl-play-btn');
  const plSongsContainer = document.getElementById('pl-songs-container');

  artistBackBtn.addEventListener('click', () => {
    hideAllViews();
    viewport.style.display = "flex";
    if(mainContentArea) mainContentArea.scrollTop = 0;
  });
  playlistBackBtn.addEventListener('click', () => {
    hideAllViews();
    viewport.style.display = 'flex';
    isRadioMode = false;
    if(mainContentArea) mainContentArea.scrollTop = 0;
  });
  const homebtn = document.getElementById('Home-btn');
  if(homebtn) {
      homebtn.addEventListener('click', (e) => {
        e.preventDefault();
        hideAllViews();
        viewport.style.display = 'flex';
        if(mainContentArea) mainContentArea.scrollTop = 0;
      });
  }

  const popA = document.getElementById('POP-artists');
  popA.innerHTML = "";
  const randomArtists = [...artists].sort(() => 0.5 - Math.random()).slice(0, 6);

  randomArtists.forEach(artist => {
    const Card = document.createElement('div');
    Card.className = "card artist-card";

    Card.innerHTML = `
        <div class="card-image rounded">
            <img src="${artist.image}" alt="${artist.name}">
        </div>
        <div class="card-info">
            <h4>${artist.name}</h4>
        </div>`;

    Card.addEventListener('click', () => {
      hideAllViews();
      artistPage.style.display = "flex";
      if(mainContentArea) mainContentArea.scrollTop = 0;

      artistPic.innerHTML = `<img src="${artist.image}" style="width:100%;height:100%;object-fit:cover;">`;
      artistNameEl.innerHTML = `<h4>${artist.name}</h4>`;

      const ArtistsSong = songs.filter(song => song.artist.includes(artist.name));
      displaySongs(ArtistsSong, artistSongGrid);
    });
    popA.appendChild(Card);
  });

  const artistPlayBtn = document.getElementById('pl-play-btn1');
  artistPlayBtn.addEventListener('click', async () => { 
    if(!canPlay()) return; 

    const artistName = artistNameEl.innerText; 
    const artistSongs = ALL_SONGS.filter(song => artistName.includes(song.artist));

    if (artistSongs.length > 0) {
        isRadioMode = false;
        const firstSong = artistSongs[0];
        setMusicIndex = ALL_SONGS.findIndex(s => s.file === firstSong.file);
        myMusic.src = firstSong.file;
        myMusic.load();
        myMusic.play();
        await updatePlayerUI(firstSong);
    }
  });

  const disbtn = document.getElementById('discovery-btn');
  const discoverImg = document.querySelector('#album img');
  
  disbtn.addEventListener('click', async () => { 
    if(!canPlay()) return; 

    const shuffleEl = document.getElementById('Shuffle');
    // Turn shuffle on automatically for Discovery
    if (!isShuffleMode) {
        isShuffleMode = true;
        if(shuffleEl) shuffleEl.innerHTML = ' <span class="material-symbols-outlined" style=" background-color: greenyellow;">shuffle</span>';
    }

    // Pick random start
    const randomIndex = Math.floor(Math.random() * ALL_SONGS.length);
    setMusicIndex = randomIndex;
    
    // Create the shuffle queue
    createShuffleQueue(setMusicIndex);
    
    const newSong = ALL_SONGS[setMusicIndex]; 

    myMusic.src = newSong.file;
    myMusic.load();
    myMusic.play();
    await updatePlayerUI(newSong);

    if (discoverImg) {
      discoverImg.src = newSong.image; 
    }
  });

  const radioCards = document.querySelectorAll('.radio-card');
  radioCards.forEach(card => {
    card.addEventListener('click', () => {
      const genre = card.id;
      currentRadioGenre = genre;
      const genreImage = card.querySelector('img').src;
      const genreSongs = ALL_SONGS.filter(song => song.genre === genre);

      plImg.innerHTML = `<img src="${genreImage}" alt="${genre}">`;
      plTitle.textContent = `${genre} Radio`;
      plDesc.textContent = `Non-stop ${genre} hits.`;

      displaySongs(genreSongs, plSongsContainer);

      hideAllViews();
      playlistView.style.display = 'flex';
      if(mainContentArea) mainContentArea.scrollTop = 0;
    });
  });

  plPlayBtn.addEventListener('click', async () => { 
    if(!canPlay()) return; 

    isRadioMode = true; 
    let genreSongs = ALL_SONGS.filter(song => song.genre === currentRadioGenre);

    for (let i = genreSongs.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [genreSongs[i], genreSongs[j]] = [genreSongs[j], genreSongs[i]];
    }

    radioQueue = genreSongs; 
    currentRadioQueueIndex = 0;

    if (radioQueue.length > 0) {
      const firstSong = radioQueue[currentRadioQueueIndex];
      setMusicIndex = ALL_SONGS.findIndex(s => s.file === firstSong.file);
      myMusic.src = firstSong.file;
      myMusic.load();
      myMusic.play();
      await updatePlayerUI(firstSong); 
    } else {
      console.log(`No songs found for ${currentRadioGenre}`);
    }
  });

  // --- PLAYER CONTROLS ---
  start.addEventListener('click', () => {
    if(!canPlay()) return; 
    if (myMusic.paused) {
      myMusic.play();
      start.innerHTML = '<span class="material-symbols-outlined">pause</span>';
    } else {
      myMusic.pause();
      start.innerHTML = '<span class="material-symbols-outlined">play_arrow</span>';
    }
  });

  // --- UPDATED NEXT BUTTON LOGIC ---
  next.addEventListener('click', async () => { 
    if(!canPlay()) return;
    myMusic.pause();
    let newIndex;

    if (isRadioMode) {
      currentRadioQueueIndex = (currentRadioQueueIndex + 1) % radioQueue.length;
      const nextRadioSong = radioQueue[currentRadioQueueIndex];
      newIndex = ALL_SONGS.findIndex(s => s.file === nextRadioSong.file);
    } 
    else if (isShuffleMode) {
        // SHUFFLE LOGIC: Move to next item in the shuffled queue
        shuffleIndex = (shuffleIndex + 1) % shuffledQueue.length;
        newIndex = shuffledQueue[shuffleIndex];
    } 
    else {
        // NORMAL LOGIC: Just add 1
        newIndex = (setMusicIndex + 1) % ALL_SONGS.length;
    }
    
    if (newIndex !== -1) {
      setMusicIndex = newIndex;
      myMusic.src = ALL_SONGS[setMusicIndex].file;
      myMusic.load();
      myMusic.play();
      await updatePlayerUI(ALL_SONGS[setMusicIndex]);
    }
  });

  // --- UPDATED PREVIOUS BUTTON LOGIC ---
  Before.addEventListener('click', async () => { 
    if(!canPlay()) return;
    myMusic.pause();
    let newIndex;

    if (isRadioMode) {
      currentRadioQueueIndex = (currentRadioQueueIndex - 1 + radioQueue.length) % radioQueue.length;
      const prevRadioSong = radioQueue[currentRadioQueueIndex];
      newIndex = ALL_SONGS.findIndex(s => s.file === prevRadioSong.file);
    } 
    else if (isShuffleMode) {
        // SHUFFLE LOGIC: Move back in the shuffled queue
        shuffleIndex = (shuffleIndex - 1 + shuffledQueue.length) % shuffledQueue.length;
        newIndex = shuffledQueue[shuffleIndex];
    } 
    else {
        // NORMAL LOGIC: Just subtract 1
        newIndex = (setMusicIndex - 1 + ALL_SONGS.length) % ALL_SONGS.length;
    }

    if (newIndex !== -1) {
      setMusicIndex = newIndex;
      myMusic.src = ALL_SONGS[setMusicIndex].file;
      myMusic.load();
      myMusic.play();
      await updatePlayerUI(ALL_SONGS[setMusicIndex]); 
    }
  });

  myMusic.addEventListener('ended', () => {
    next.click();
  });


  // --- UPDATED SHUFFLE BUTTON LOGIC ---
  const shuffle = document.getElementById('Shuffle');
  if(shuffle) {
      shuffle.addEventListener('click', () => {
        // Toggle global shuffle mode
        isShuffleMode = !isShuffleMode;
        
        if (isShuffleMode) {
          // 1. Visual Feedback
          shuffle.innerHTML = ' <span class="material-symbols-outlined" style=" background-color: greenyellow;">shuffle</span>';
          // 2. Create the shuffled queue IMMEDIATELY starting with current song
          createShuffleQueue(setMusicIndex);
        } else {
          // 1. Visual Feedback
          shuffle.innerHTML = '<span class="material-symbols-outlined">shuffle</span>';
          // 2. Clear queue (optional, logic just falls back to normal index)
          shuffledQueue = [];
        }
      });
  }

  function updateSeekBg() {
    if (!seeker) return;
    const min = parseFloat(seeker.min) || 0;
    const max = parseFloat(seeker.max) || 1;
    const val = parseFloat(seeker.value) || 0;
    const pct = Math.max(0, Math.min(100, (val - min) / (max - min) * 100));
    seeker.style.background = `linear-gradient(90deg, #fff ${pct}%, rgba(255,255,255,0.18) ${pct}%)`;
  }

  myMusic.addEventListener('loadedmetadata', () => {
    seeker.max = myMusic.duration;
    updateSeekBg();
  });
  myMusic.addEventListener('timeupdate', () => {
    seeker.value = myMusic.currentTime;
    updateSeekBg();
  });
  seeker.addEventListener('input', () => {
    if(!canPlay()) {
        seeker.value = 0;
        return;
    }
    myMusic.currentTime = seeker.value;
    updateSeekBg();
  });

  myMusic.addEventListener('play', () => {
    start.innerHTML = '<span class="material-symbols-outlined">pause</span>';
  });
  myMusic.addEventListener('pause', () => {
    start.innerHTML = '<span class="material-symbols-outlined">play_arrow</span>';
  });
  
  updateSeekBg();
}

setupMusic();