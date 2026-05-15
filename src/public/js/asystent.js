/**
 * Asystent.io — AI Exit-Intent Popup for WooCommerce
 * Version: 1.0.0
 * 
 * Usage: Include on page with:
 * <script src="https://api.asystent.io/js/asystent.js" data-api-key="YOUR_KEY"></script>
 */
(function() {
  "use strict";

  // ─── Config ────────────────────────────────────────────
  var scriptTag = document.currentScript || document.querySelector('script[data-api-key]');
  var API_KEY = scriptTag ? scriptTag.getAttribute("data-api-key") : null;
  var API_BASE = scriptTag ? (scriptTag.getAttribute("data-api-url") || "https://api.asystent.io") : "https://api.asystent.io";

  if (!API_KEY) {
    console.warn("[Asystent.io] Missing data-api-key attribute on script tag.");
    return;
  }

  // ─── Session ───────────────────────────────────────────
  var SESSION_KEY = "asystent_session";
  var SHOWN_KEY = "asystent_shown";

  function getSessionId() {
    var sid = sessionStorage.getItem(SESSION_KEY);
    if (!sid) {
      sid = "s_" + Math.random().toString(36).substr(2, 12) + Date.now().toString(36);
      sessionStorage.setItem(SESSION_KEY, sid);
    }
    return sid;
  }

  function wasPopupShown() {
    return sessionStorage.getItem(SHOWN_KEY) === "1";
  }

  function markPopupShown() {
    sessionStorage.setItem(SHOWN_KEY, "1");
  }

  // ─── Cart Detection (WooCommerce) ─────────────────────
  function getCartData() {
    // Method 1: Read from wc_cart_fragments (most reliable)
    var fragments = null;
    try {
      var raw = sessionStorage.getItem("wc_fragments_" + window.location.host) ||
                sessionStorage.getItem("wc_fragments");
      if (raw) fragments = JSON.parse(raw);
    } catch(e) {}

    // Method 2: Read from global WooCommerce cart data
    if (window.wc_cart_fragments_params || window.wc_add_to_cart_params) {
      // Cart data available via WC
    }

    // Method 3: Read from asystent_cart_data (injected by WP plugin)
    if (window.asystent_cart_data) {
      return {
        items: window.asystent_cart_data.items || [],
        total: parseFloat(window.asystent_cart_data.total) || 0,
        has_free_shipping: window.asystent_cart_data.has_free_shipping || false
      };
    }

    // Method 4: Read cart from DOM (fallback)
    var cartCount = 0;
    var cartTotal = 0;
    var cartCountEl = document.querySelector(".cart-contents .count, .cart-count, .mini-cart-count, [data-cart-count]");
    if (cartCountEl) {
      cartCount = parseInt(cartCountEl.textContent) || 0;
    }
    var cartTotalEl = document.querySelector(".cart-contents .amount, .cart-total .amount, .woocommerce-Price-amount");
    if (cartTotalEl) {
      var priceText = cartTotalEl.textContent.replace(/[^\d.,]/g, "").replace(",", ".");
      cartTotal = parseFloat(priceText) || 0;
    }

    return {
      items: cartCount > 0 ? [{ name: "Produkty w koszyku", price: cartTotal, quantity: cartCount }] : [],
      total: cartTotal,
      has_free_shipping: false
    };
  }

  // ─── Exit Intent Detection ─────────────────────────────
  var exitIntentTriggered = false;
  var mouseY = 0;
  var lastScrollY = 0;
  var scrollVelocity = 0;

  function onMouseMove(e) {
    mouseY = e.clientY;
    // Trigger when mouse moves to top 5px of viewport (heading to close/back)
    if (mouseY <= 5 && !exitIntentTriggered) {
      triggerExitIntent("mouse_top");
    }
  }

  function onMouseLeave(e) {
    // Mouse left the document (moved to browser chrome)
    if (e.clientY <= 0 && !exitIntentTriggered) {
      triggerExitIntent("mouse_leave");
    }
  }

  function onScroll() {
    var currentY = window.scrollY;
    scrollVelocity = lastScrollY - currentY; // positive = scrolling up
    lastScrollY = currentY;

    // Rapid scroll up from deep in page
    if (scrollVelocity > 80 && currentY > 300 && !exitIntentTriggered) {
      triggerExitIntent("rapid_scroll_up");
    }
  }

  function onVisibilityChange() {
    if (document.hidden && !exitIntentTriggered) {
      triggerExitIntent("tab_switch");
    }
  }

  function onPopState() {
    if (!exitIntentTriggered) {
      triggerExitIntent("back_button");
    }
  }

  // Mobile: detect "pull to refresh" or scroll to very top
  var touchStartY = 0;
  function onTouchStart(e) {
    touchStartY = e.touches[0].clientY;
  }
  function onTouchEnd(e) {
    var touchEndY = e.changedTouches[0].clientY;
    var diff = touchEndY - touchStartY;
    // Swipe down from top of page
    if (diff > 100 && window.scrollY < 50 && !exitIntentTriggered) {
      triggerExitIntent("mobile_swipe_down");
    }
  }

  function attachListeners() {
    document.addEventListener("mousemove", onMouseMove, { passive: true });
    document.addEventListener("mouseleave", onMouseLeave);
    window.addEventListener("scroll", onScroll, { passive: true });
    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("popstate", onPopState);
    document.addEventListener("touchstart", onTouchStart, { passive: true });
    document.addEventListener("touchend", onTouchEnd, { passive: true });
  }

  function detachListeners() {
    document.removeEventListener("mousemove", onMouseMove);
    document.removeEventListener("mouseleave", onMouseLeave);
    window.removeEventListener("scroll", onScroll);
    document.removeEventListener("visibilitychange", onVisibilityChange);
    window.removeEventListener("popstate", onPopState);
    document.removeEventListener("touchstart", onTouchStart);
    document.removeEventListener("touchend", onTouchEnd);
  }

  // ─── Trigger & API Call ────────────────────────────────
  function triggerExitIntent(reason) {
    if (exitIntentTriggered || wasPopupShown()) return;
    exitIntentTriggered = true;

    var cart = getCartData();
    if (!cart.items.length || cart.total <= 0) return;

    var payload = {
      api_key: API_KEY,
      cart_items: cart.items,
      cart_total: cart.total,
      page_url: window.location.href,
      session_id: getSessionId(),
      has_free_shipping: cart.has_free_shipping
    };

    fetch(API_BASE + "/api/v1/popup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    })
    .then(function(r) { return r.json(); })
    .then(function(data) {
      if (data.show) {
        // If discount strategy, auto-create WooCommerce coupon
        if (data.strategy === "discount" && data.discount_code) {
          createWcCoupon(data.discount_code, data.discount_percentage || 10);
        }
        showPopup(data);
        markPopupShown();
        detachListeners();
      } else {
        exitIntentTriggered = false; // allow retry
      }
    })
    .catch(function(err) {
      console.warn("[Asystent.io] Popup fetch error:", err);
      exitIntentTriggered = false;
    });
  }

  // ─── Popup Rendering ──────────────────────────────────
  function showPopup(data) {
    var colors = data.colors || { primary: "#3b82f6", background: "#ffffff", text: "#1a1a2e" };
    var popupId = data.popup_id;
    var formspree = data.formspree_endpoint;

    // Create overlay
    var overlay = document.createElement("div");
    overlay.id = "asystent-overlay";
    overlay.style.cssText = "position:fixed;inset:0;background:rgba(0,0,0,0.55);z-index:999998;opacity:0;transition:opacity 0.25s ease;display:flex;align-items:center;justify-content:center;padding:16px;";

    // Create popup
    var popup = document.createElement("div");
    popup.id = "asystent-popup";
    popup.style.cssText = "background:" + colors.background + ";color:" + colors.text + ";border-radius:16px;max-width:440px;width:100%;padding:32px;position:relative;transform:scale(0.95);opacity:0;transition:transform 0.3s cubic-bezier(0.23,1,0.32,1),opacity 0.3s ease;box-shadow:0 25px 60px rgba(0,0,0,0.3);font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;";

    // Close button
    var closeBtn = document.createElement("button");
    closeBtn.innerHTML = "&times;";
    closeBtn.style.cssText = "position:absolute;top:12px;right:16px;background:none;border:none;font-size:24px;color:" + colors.text + ";opacity:0.4;cursor:pointer;line-height:1;padding:4px;";
    closeBtn.onclick = function() { dismissPopup(overlay, popupId); };

    // Headline
    var headline = document.createElement("h3");
    headline.textContent = data.headline;
    headline.style.cssText = "margin:0 0 12px;font-size:22px;font-weight:700;line-height:1.3;";

    // Body
    var body = document.createElement("p");
    body.textContent = data.body;
    body.style.cssText = "margin:0 0 20px;font-size:15px;line-height:1.6;opacity:0.75;";

    // Discount code badge
    var codeBadge = null;
    if (data.discount_code) {
      codeBadge = document.createElement("div");
      codeBadge.style.cssText = "background:" + colors.primary + "15;border:1px dashed " + colors.primary + ";border-radius:8px;padding:10px 16px;margin-bottom:20px;text-align:center;";
      codeBadge.innerHTML = '<span style="font-size:12px;opacity:0.6;">Twój kod rabatowy:</span><br><strong style="font-size:20px;letter-spacing:2px;color:' + colors.primary + ';">' + data.discount_code + '</strong>';
    }

    // Email field (if enabled)
    var emailSection = null;
    if (data.show_email_field) {
      emailSection = document.createElement("div");
      emailSection.style.cssText = "margin-bottom:16px;";
      var emailInput = document.createElement("input");
      emailInput.type = "email";
      emailInput.placeholder = "Twój email (opcjonalnie)";
      emailInput.id = "asystent-email";
      emailInput.style.cssText = "width:100%;box-sizing:border-box;padding:12px 16px;border:1px solid " + colors.text + "20;border-radius:8px;font-size:14px;background:" + colors.background + ";color:" + colors.text + ";outline:none;";
      emailSection.appendChild(emailInput);
    }

    // CTA button
    var ctaBtn = document.createElement("button");
    ctaBtn.textContent = data.cta_text;
    ctaBtn.style.cssText = "width:100%;padding:14px;background:" + colors.primary + ";color:#fff;border:none;border-radius:10px;font-size:16px;font-weight:600;cursor:pointer;transition:transform 0.15s ease,box-shadow 0.2s ease;margin-bottom:8px;";
    ctaBtn.onmouseenter = function() { ctaBtn.style.transform = "translateY(-1px)"; ctaBtn.style.boxShadow = "0 4px 16px " + colors.primary + "40"; };
    ctaBtn.onmouseleave = function() { ctaBtn.style.transform = ""; ctaBtn.style.boxShadow = ""; };
    ctaBtn.onclick = function() {
      var email = document.getElementById("asystent-email");
      var emailVal = email ? email.value : "";

      // Track conversion
      trackEvent("popup_clicked", popupId, emailVal);

      // If email provided, also capture it
      if (emailVal && emailVal.includes("@")) {
        trackEvent("email_captured", popupId, emailVal);
        // Send to Formspree if configured
        if (formspree) {
          sendToFormspree(formspree, emailVal, data);
        }
      }

      closePopup(overlay);
    };

    // Secondary CTA (dismiss)
    var secondaryBtn = document.createElement("button");
    secondaryBtn.textContent = data.secondary_cta || "Nie teraz";
    secondaryBtn.style.cssText = "width:100%;padding:10px;background:transparent;border:none;font-size:13px;color:" + colors.text + ";opacity:0.45;cursor:pointer;";
    secondaryBtn.onclick = function() { dismissPopup(overlay, popupId); };

    // Branding
    var branding = null;
    if (data.branding) {
      branding = document.createElement("div");
      branding.style.cssText = "text-align:center;margin-top:16px;padding-top:12px;border-top:1px solid " + colors.text + "10;";
      branding.innerHTML = '<a href="https://asystent.io" target="_blank" rel="noopener" style="font-size:11px;color:' + colors.text + ';opacity:0.3;text-decoration:none;">Powered by Asystent.io</a>';
    }

    // Assemble
    popup.appendChild(closeBtn);
    popup.appendChild(headline);
    popup.appendChild(body);
    if (codeBadge) popup.appendChild(codeBadge);
    if (emailSection) popup.appendChild(emailSection);
    popup.appendChild(ctaBtn);
    popup.appendChild(secondaryBtn);
    if (branding) popup.appendChild(branding);
    overlay.appendChild(popup);
    document.body.appendChild(overlay);

    // Animate in
    requestAnimationFrame(function() {
      overlay.style.opacity = "1";
      popup.style.transform = "scale(1)";
      popup.style.opacity = "1";
    });

    // Close on overlay click
    overlay.addEventListener("click", function(e) {
      if (e.target === overlay) dismissPopup(overlay, popupId);
    });

    // Close on Escape
    document.addEventListener("keydown", function escHandler(e) {
      if (e.key === "Escape") {
        dismissPopup(overlay, popupId);
        document.removeEventListener("keydown", escHandler);
      }
    });
  }

  function closePopup(overlay) {
    overlay.style.opacity = "0";
    var popup = overlay.querySelector("#asystent-popup");
    if (popup) {
      popup.style.transform = "scale(0.95)";
      popup.style.opacity = "0";
    }
    setTimeout(function() {
      if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
    }, 300);
  }

  function dismissPopup(overlay, popupId) {
    trackEvent("popup_dismissed", popupId);
    closePopup(overlay);
  }

  // ─── Event Tracking ───────────────────────────────────
  function trackEvent(type, popupId, email) {
    var cart = getCartData();
    fetch(API_BASE + "/api/v1/event", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_key: API_KEY,
        popup_id: popupId,
        type: type,
        session_id: getSessionId(),
        email: email || "",
        cart_value: cart.total
      })
    }).catch(function() {});
  }

  // ─── Formspree Integration ────────────────────────────
  function sendToFormspree(endpoint, email, popupData) {
    var formData = new FormData();
    formData.append("email", email);
    formData.append("_subject", "Porzucony koszyk — " + popupData.strategy);
    formData.append("cart_value", popupData.cart_total || "");
    formData.append("strategy", popupData.strategy || "");
    formData.append("source", "asystent.io exit-intent popup");

    fetch(endpoint, {
      method: "POST",
      body: formData,
      headers: { "Accept": "application/json" }
    }).catch(function() {});
  }

  // ─── WooCommerce Coupon Creation ──────────────────────
  function createWcCoupon(code, percentage) {
    // Use the WP AJAX endpoint if available (injected by WP plugin)
    var endpoint = window.asystent_coupon_endpoint;
    if (!endpoint) return; // Not on WooCommerce or plugin not installed

    var cartData = window.asystent_cart_data || {};
    var apiKey = cartData.api_key || API_KEY;

    var formData = new FormData();
    formData.append("action", "asystent_create_coupon");
    formData.append("api_key", apiKey);
    formData.append("code", code);
    formData.append("percentage", percentage);
    formData.append("expires_minutes", "15");

    fetch(endpoint, {
      method: "POST",
      body: formData
    })
    .then(function(r) { return r.json(); })
    .then(function(data) {
      if (data.success) {
        console.log("[Asystent.io] Coupon created:", code);
      }
    })
    .catch(function(err) {
      console.warn("[Asystent.io] Coupon creation failed:", err);
    });
  }

  // ─── Initialize ───────────────────────────────────────
  function init() {
    // Wait for page to be interactive
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", start);
    } else {
      start();
    }
  }

  function start() {
    // Delay listener attachment slightly to avoid triggering on page load
    setTimeout(function() {
      attachListeners();
    }, 2000);
  }

  init();
})();
