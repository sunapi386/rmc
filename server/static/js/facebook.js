define(
['ext/jquery', 'ext/cookie', 'ext/facebook'],
function($, __, FB) {

  // This does not need to wait until DOMReady
  if (window.pageData.env === 'dev') {
    var appId = '289196947861602';
  } else {
    var appId = '219309734863464';
  }
  FB.init({appId: appId, status: true, cookie: true, xfbml: true});

  var login = function(authResp, params, source, nextUrl) {
    // FIXME[uw](Sandy): Sending all this info in the cookie will easily allow
    // others to hijack someonne's session. We should probably look into
    // a way of verifying the request. Maybe that's what Facebook Signed
    // Requests are for? There are two corresponding server-side FIXMEs for this
    params.fb_signed_request = authResp.signedRequest;
    // TODO(Sandy): When switching over to Flask sessions be sure to remove
    // these old cookies
    $.cookie('fbid', authResp.userID, { expires: 365, path: '/' });
    $.cookie('fb_access_token', authResp.accessToken,
        { expires: 365, path: '/' });
    $.cookie('fb_access_token_expires_in', authResp.expiresIn,
        { expires: 365, path: '/' });
    // TODO(Sandy): This assumes the /login request will succeed, which may not
    // be the case. But if we make this request in the success handler, it might
    // not get logged at all (due to redirect). We could setTimeout it, but that
    // would cause delay and also I think /login should normally just be
    // successful. Do this server side or on next page
    // TODO(Sandy): This counts people whose cookies were dead, but have
    // already TOSed Flow on Facebook. We should log each group individually
    // TODO(Sandy): Assert source
    _gaq.push([
      '_trackEvent',
      'USER_GENERIC',
      'FACEBOOK_CONNECT_' + String(source).toUpperCase()
    ]);
    mixpanel.track('Facebook Connect', { source: source });

    $.ajax('/login', {
      data: params,
      type: 'POST',
      success: function(data) {
        // Fail safe to make sure at least we sent off the _gaq trackEvent
        _gaq.push(function() {
          if (nextUrl) {
            window.location.href = '/profile?next=' +
              window.encodeURIComponent(nextUrl);
          } else {
            window.location.href = '/profile';
          }
        });
      },
      error: function(xhr) {
        FB.logout(function() {
          window.location.href = '/';
        });
      }
    });
  };

  // TODO(Sandy): MARKED FOR DELETEION. Now that we redirect from the server, we
  // might not need this logic here. We should consider if there are any other
  // cases that needs this logic (eg. maybe we want the user to be able to see
  // the landing page?)
  var loginIfPossible = function(source, nextUrl) {
    FB.getLoginStatus(function(response) {
      // TODO(Sandy): Make redirect happen server-side so we don't even need to load the landing page
      // TODO(Sandy): Fetch user data here or better yet use realtime API to get friend updates
      if (response.status === 'connected') {
        // The user is already logged into Facebook and has ToSed our app before
        // Store the potentially updated access token in DB if necessary
        login(response.authResponse, {}, source, nextUrl);
      }
    });
  };

  var logout = function(cb) {
    $.removeCookie('fbid');
    $.removeCookie('fb_access_token');
    $.removeCookie('fb_access_token_expires_in');
    FB.logout(cb);
  };


  // TODO(mack): this should be moved into its own backbone view
  var initConnectButton = function(source, nextUrl) {
    // Set the app_id on Facepile before we call FB.init
    $('.fb-facepile').attr('data-app-id', appId);

    // TODO(mack): This is being again because the facepil element might have
    // been added to the page after page load (i.e. via backbone view). Should
    // figure out better way to do it without calling this again.
    FB.init({appId: appId, status: true, cookie: true, xfbml: true});

    // Facebook Connect button
    $('.fb-login-button').click(function() {
      // TODO(Sandy): Put up drip loader here
      FB.login(function(response) {
        if (response.status !== 'connected') {
          // TODO(Sandy): Handle what happens when they don't login?
          return;
        }

        // Potentially first login, fetch user data from the FB Graph API
        var authResponse = response.authResponse;

        var deferredFriends = new $.Deferred();
        FB.api('/me/friends', function(response) {
          var fbids = _.pluck(response.data, 'id');
          deferredFriends.resolve(fbids);
        });

        var deferredMe = new $.Deferred();
        FB.api('/me', function(response) {
          deferredMe.resolve(response);
        });

        $.when(deferredMe, deferredFriends).done(function(me, friendFbids) {
          var params = {
            'friend_fbids': JSON.stringify(friendFbids),
            'first_name': me.first_name,
            'middle_name': me.middle_name,
            'last_name': me.last_name,
            'email': me.email,
            'gender': me.gender
          };
          login(authResponse, params, source, nextUrl);
        });
      }, {scope: 'email'});
    });
  };

  var showSendDialogProfile = function(cb) {
    // TODO(Sandy): Don't hardcode link?
    var sendDialogLink = 'http://uwflow.com';

    FB.ui({
        method: 'send',
        name: 'Flow',
        link: sendDialogLink,
        picture: 'http://uwflow.com/static/img/logo/flow_75x75.png',
        description: 'Plan your course with friends in mind!'
      }, cb);
  }

  return {
    initConnectButton: initConnectButton,
    loginIfPossible: loginIfPossible,
    logout: logout,
    showSendDialogProfile: showSendDialogProfile
  };

});
