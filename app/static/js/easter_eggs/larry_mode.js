document.addEventListener('DOMContentLoaded', () => {
  // --- Larry Easter Egg Logic ---
  const larryTriggerButton = document.querySelector('.generate-btn'); // Target the main generate button
  const larryOverlay = document.getElementById('larryOverlay');
  const larryImage = document.getElementById('larryImage');
  const larrySound = document.getElementById('larrySound');
  const mainContentContainer = document.querySelector('.index-page-container');

  let larryClickTimestamps = [];
  const LARRY_CLICK_LIMIT = 30;
  const LARRY_TIME_WINDOW_MS = 60000; // 60 seconds
  let larryModeActive = false;

  function activateLarryMode() {
    if (larryModeActive || !larryOverlay || !larryImage || !larrySound || !mainContentContainer) return;
    larryModeActive = true;
    console.log("Larry Mode Activated!");

    // 1. Fade out main content
    mainContentContainer.classList.add('content-fade-out');

    // 2. Show and fade in overlay (background color transition is via inline style in HTML)
    larryOverlay.style.display = 'block';
    setTimeout(() => { // Timeout to allow display:block to take effect before transition
        larryOverlay.classList.add('larry-overlay-active');
    }, 20);


    // 3. Show and fade in image (opacity and transform transition is via inline style in HTML)
    larryImage.style.display = 'block';
    setTimeout(() => { // Timeout for display:block
        larryImage.classList.add('larry-image-active');
    }, 20);


    // 4. Play sound
    if (larrySound.readyState >= 2) { // HAVE_CURRENT_DATA or more
        larrySound.currentTime = 0;
        larrySound.play().catch(e => console.error("Larry sound play error:", e));
    } else {
        larrySound.addEventListener('canplaythrough', () => {
            larrySound.currentTime = 0;
            larrySound.play().catch(e => console.error("Larry sound play error (oncanplay):", e));
        }, { once: true });
    }
    
    // Reset clicks to prevent immediate re-trigger
    larryClickTimestamps = [];

    // Optional: Revert after some time
    // setTimeout(() => {
    //     mainContentContainer.classList.remove('content-fade-out');
    //     larryOverlay.classList.remove('larry-overlay-active');
    //     larryImage.classList.remove('larry-image-active');
    //     setTimeout(() => {
    //         larryOverlay.style.display = 'none';
    //         larryImage.style.display = 'none';
    //         larryModeActive = false;
    //     }, 1500); // Match transition times
    // }, 10000); // Revert after 10 seconds
  }

  if (larryTriggerButton) {
    // Check if the current page is the index page before adding the listener
    // This is a simple check; more robust checks might involve checking window.location.pathname
    if (document.body.classList.contains('index-page') || document.querySelector('.index-page-container')) {
        larryTriggerButton.addEventListener('click', (event) => {
            // Prevent form submission if the easter egg is about to be triggered or is active
            // This is important because the button is a submit type.
            if (larryModeActive || (larryClickTimestamps.length + 1 >= LARRY_CLICK_LIMIT)) {
                 // Check if this click will trigger it
                const now = Date.now();
                const potentialTimestamps = [...larryClickTimestamps, now].filter(timestamp => now - timestamp < LARRY_TIME_WINDOW_MS);
                if (potentialTimestamps.length >= LARRY_CLICK_LIMIT) {
                    event.preventDefault(); // Prevent form submission
                    console.log("Larry Mode about to trigger, preventing default button action.");
                }
            }
            
            if (larryModeActive) return;

            const now = Date.now();
            larryClickTimestamps.push(now);

            larryClickTimestamps = larryClickTimestamps.filter(timestamp => now - timestamp < LARRY_TIME_WINDOW_MS);

            if (larryClickTimestamps.length >= LARRY_CLICK_LIMIT) {
                activateLarryMode();
            }
        });
    }
  } else {
    // It's normal for this button not to be found on other pages where form.js might be loaded.
    // console.warn("Larry trigger button (.generate-btn) not found on this page, or not on index page.");
  }
  // --- End Larry Easter Egg Logic ---
});
