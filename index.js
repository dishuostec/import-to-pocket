var Cache = require('cache-storage')
	, Promise = require('node-promise')
	, request = require('request')
	, FileStorage = require('cache-storage/Storage/FileStorage')
	, http = require('http')
	, qs = require('querystring');

var cache = new Cache(new FileStorage('./config'), 'app');


var cb = 'http://localhost:8080/callback';

var app = cache.load('app') || {};	

if ( ! app.consumer_key) {
	app.consumer_key = '18055-9d9d2668327be62c13dc2e35';
	cache.save('app', app);	
}

var code;

console.log('CONFIG', app);

if (app.access_token) {
	import_data(app.access_token);
} else {
	wait_for_user_auth();
}

function wait_for_user_auth() {
	console.log('Visit http://localhost:8080 to auth.');
	
	http.createServer(function(req, resp) {

		switch (req.url) {
			case '/favicon.ico':
				resp.writeHead(404);
				resp.end();
				break;
			case '/':
			case '/callback':
				(code ? receive_callback : redirect_to_pocket)(req, resp);
				break;
			
			default:
				console.log('NOP', req.url);
				resp.writeHead(404);
				resp.end();
		}
	}).listen(8080, '127.0.0.1');
};

function redirect_to_pocket(req, resp) {
	api('oauth/request', {
		'consumer_key': app.consumer_key,
		'redirect_uri': cb,
	})
	.then(function(data) {
		code = data.code;

		var auth_url = 'https://getpocket.com/auth/authorize?request_token='+code+'&redirect_uri='+encodeURIComponent(cb);

		resp.writeHead(302, {
			'Location': auth_url
		});
		resp.end(auth_url);
		
	}, function(error) {
		resp.end(error);
	});
}

function receive_callback (req, resp) {
	api('oauth/authorize', {
		'consumer_key': app.consumer_key,
		'code': code,
	})
	.then(function(data) {
		app.access_token = data.access_token;
		app.username = data.username;

		cache.save('app', app);	
		resp.end('ok');

		import_data(app.access_token);
	}, function(error) {
		resp.end(error);
	});
}

function import_data(access_token) {
	console.log('IMPORT DATA');

	var data = require('./starred.json');

	data.items.forEach(function(item) {
		add(item.alternate[0].href, item.title)
		.then(function(data) {
			console.log(item.title, data.status);
		}, function(err) {
			console.log(err);
		});
	});
}

function add(url, title, tags) {
	var data = {
		url: url,
		consumer_key: app.consumer_key,
		access_token: app.access_token,
	};

	title && (data.title = title);
	tags && (data.tags = tags);

	return api('add', data);
}

function api(uri, data) {
	console.log('API request:'+uri, data);

	var deferred = Promise.defer();

	request({
		url: 'https://getpocket.com/v3/'+uri,
		method: 'POST',
		body: JSON.stringify(data),	
		headers: {
			'X-Accept': 'application/json',
			'Content-Type': 'application/json; charset=UTF8',
		},
	}, function(error, response, body) {
		if (error) {
			deferred.reject(error);
			return;
		}

		deferred.resolve(JSON.parse(body));
	})

	deferred.then(function(data) {
		// console.log('API done:'+uri, typeof data, data);
	}, function(err) {
		console.log('API fail:'+uri, typeof data, err);
	});

	return deferred.promise;
}
