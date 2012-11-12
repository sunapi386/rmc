define(
['ext/jquery', 'ext/underscore', 'ext/cookie'],
function($, _, __) {

  var fbApiInit = false;
  if (window.pageData.env === 'dev') {
    fbAppId = '289196947861602';
  } else {
    fbAppId = '219309734863464';
  }

  var _initializedFacebook = false;
  var initializedFacebook = function() {
    return _initializedFacebook;
  };

  var initFacebook = function(force) {
    if (force || !_initializedFacebook) {
      FB.init({appId: fbAppId, status: true, cookie: true, xfbml: true});
      _initializedFacebook = true;
    }
  };

  var fbSignedRequest;
  window.fbAsyncInit = function() {
    initFacebook();
    FB.getLoginStatus(function(response) {
      fbApiInit = true;
      if (response.status === 'connected') {
        fbSignedRequest = response.authResponse.signedRequest;
      } else if (response.status === 'not_authorized') {
        // the user is logged in to Facebook, but didn't auth yet
      } else {
        // the user isn't logged in to Facebook.
      }
    });
  };

  // Load the SDK's source Asynchronously
  (function(d){
    var js, id = 'facebook-jssdk', ref = d.getElementsByTagName('script')[0];
    if (d.getElementById(id)) {return;}
    js = d.createElement('script'); js.id = id; js.async = true;
    js.src = '//connect.facebook.net/en_US/all.js';
    ref.parentNode.insertBefore(js, ref);
  }(document));

  var login = function(authResp, params, source, nextUrl) {
    // FIXME[uw](Sandy): Sending all this info in the cookie will easily allow
    // others to hijack someonne's session. We should probably look into
    // a way of verifying the request. Maybe that's what Facebook Signed
    // Requests are for? There are two corresponding server-side FIXMEs for this
    params.fb_signed_request = authResp.signedRequest;
    // TODO(Sandy): When switching over to Flask sessions be sure to remove
    // these old cookies
    $.cookie('fbid', authResp.userID, { expires: 365, path: '/' });
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


  // TODO(mack): this should be moved into its own backbone view
  var initConnectButton = function(attributes) {
    attributes = _.extend({
      source: 'UNKNOWN',
      nextUrl: undefined
    }, attributes);

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
          login(authResponse, params, attributes.source, attributes.nextUrl);
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
        picture: sendDialogLink + '/static/img/logo/flow_75x75.png',
        description: 'Plan your courses with friends in mind!'
      }, cb);
  };

  // Ensure FB is fully initialized before calling any of its APIs. Solution
  // from http://stackoverflow.com/questions/3548493/how-to-detect-when-facebooks-fb-init-is-complete
  // TODO(mack): ensure that callbacks to fbEnsureInit() are queued/handled in same
  // order they come in
  function fbEnsureInit(cb) {
    if(!fbApiInit) {
      window.setTimeout(function() {
        fbEnsureInit(cb);
      }, 50);
    } else if(cb) {
      cb();
    }
  }

  var renewAccessToken = function() {
    // TODO(Sandy): Grab fbsr from the Fb.getLoginStatus endpoint and hit /login
    console.log('pretend to renew access token');
    if (fbSignedRequest) {
      console.log('cookies before');
      console.log($.cookie('fb_access_token'));
      console.log($.cookie('fb_access_token_expires_on'));
      $.ajax('/api/renew-fb', {
        data: { fb_signed_request: fbSignedRequest },
        type: 'POST',
        error: function(xhr) {
          // TODO(Sandy): Maybe code here to delay the next renew request? The
          // reason being that if facebook ever breaks down, then we'll
          // a warning logged to HipChat for every page-visit of a logged in
          // user...that's a lot. Alternatively, we could do this server-side
        }
      });
      console.log('cookies after');
      console.log($.cookie('fb_access_token'));
      console.log($.cookie('fb_access_token_expires_on'));
    } else {
      // TODO(Sandy): Throw client error. This shouldn't be possible right now
    }
  };

  var checkAccessToken = function() {
    // XXX(Sandy): Note to reviewers: What is your opinion on defining local
    // variables things that are used a few times? I've heard arguments for
    // portability, readability, etc. what do you guys prefer?
    var expiryTimestamp = $.cookie('fb_access_token_expires_on');
    // Simulate cookie expiration
    //expiryTimestamp -= 60 * 60 * 24;
    // TODO(Sandy): Handle the case where the cookie was cleared for whatever
    // reason. we still wnat to renew in that case (eg. renew if fbsr is
    // present and this is not)
    // TODO(Sandy): actually moving this logic to server-side might simplify
    // things. eg. other cases of tokens expiring (logouts, un-auths, etc)
    if (expiryTimestamp) {
      expiryDate = new Date(1000 * expiryTimestamp);
      // TODO(Sandy): When handling users with FB Adblocked, consider this case
      // as well (right now it should fail gracefully, but we still want a way to
      // renew the token)
      // The token lasts for 60 days. Renew after every day
      if (expiryDate - new Date() < 1000 * 60 * 60 * 24 * 59) {
        renewAccessToken();
      }
    }
  };

  // These methods require that the FB api is fully initialized
  var ensureInitMethods = {
    initConnectButton: initConnectButton,
    showSendDialogProfile: showSendDialogProfile,
    checkAccessToken: checkAccessToken
  };
  // Ensure FB is initialized before calling any functions that require FB APIs
  _.each(ensureInitMethods, function(method, name) {
    ensureInitMethods[name] = function() {
      var args = arguments;
      fbEnsureInit(function() {
        method.apply(this, args);
      });
    };
  });

  $(ensureInitMethods.checkAccessToken);

  return _.extend(ensureInitMethods, {
    initFacebook: initFacebook,
    initializedFacebook: initializedFacebook
  });
});
