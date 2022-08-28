import dotenv from 'dotenv';
dotenv.config();
import { spawn } from 'child_process';
import clipboard from 'clipboardy';

const PREVIEW = 0;
const DOWNLOAD = 1;
const SHOW_URL = 2;
const COPY_URL = 3;
let mode = PREVIEW;

let args = process.argv.slice(2);
main(args);

async function main(args) {
	let showUrl = true;
	let showBanner = false;
	let waitFor = false;
	if (args.length > 0) {
		switch (args[0].toLowerCase()) {
			case 'preview':
			case 'p':
				mode = PREVIEW;
				break;
			case 'download':
			case 'd':
				mode = DOWNLOAD;
				break;
			case 'show_url':
			case 'su':
				mode = SHOW_URL;
				break;
			case 'copy_url':
			case 'cu':
				mode = COPY_URL;
				break;
			default:
				printUsage();
				return;
		}
	}
	for (let arg of args) {
		if (arg.toLowerCase() == '--hide_url' || arg.toLowerCase() == '-hu')
			showUrl = false;
		if (arg.toLowerCase() == '--show_url' || arg.toLowerCase() == '-su')
			showUrl = true;
		if (arg.toLowerCase() == '--hide_banner' || arg.toLowerCase() == '-hb')
			showBanner = false;
		if (arg.toLowerCase() == '--show_banner' || arg.toLowerCase() == '-sb')
			showBanner = true;
		if (arg.toLowerCase() == '--wait_for' || arg.toLowerCase() == '-wf')
			waitFor = true;
	}
	if (args.length > 1) {
		switch (mode) {
			case PREVIEW:
				preview(args[1], showUrl, showBanner, waitFor);
				break;
			case DOWNLOAD:
				if (args.length > 2)
					download(args[1], args[2], showUrl, showBanner, waitFor);
				else
					printUsage();
				break;
			case SHOW_URL:
				await getUrl(args[1], showUrl);
				break;
			case COPY_URL:
				try {
					let downloadUrl = await getUrl(args[1]);
					if (downloadUrl.substring(0, 4) == 'http') {
						clipboardy.writeSync(downloadUrl);
						/*cb.setContents(selection, (Clipboard clipboard, Transferable contents) -> {
							System.exit(0);
						});*/
						// System.out.println("Copied! This application exits when you copy something else because of a limitation on Ubuntu.");
					} else
						console.log(`Error (Check your entered values or internet connection): ${downloadUrl}`);
				} catch (e) {
					console.error(e.stack);
				}
				break;
		}
	} else {
		printUsage();
	}
}

function printUsage() {
	console.log('Usage:');
	console.log("node index.js download <url> <destination.extension> [<--hide_url|-hu>|<--hide_banner|-hb>|<--wait_for|-wf>]*");
	console.log("node index.js preview <url> [<--hide_url|-hu>|<--hide_banner|-hb>|<--wait_for|-wf>]*");
	console.log("node index.js <show_url|su> <url>");
	console.log("node index.js <copy_url|cu> <url>");
}

function getHtml(text) {
	return `<html><body><p style="width: 400px;">${text}</p></body></html>`;
}

async function checkAccessible(downloadUrl) {
	let responseCode = await fetch(downloadUrl, {
		method: 'HEAD'
	}).then(res => res.status);
	if (responseCode > 199 && responseCode < 300)
		return true;
	return false;
}

async function getPreviewProcess(url, printToConsole, showBanner) {
	let args = [];
	if (!showBanner)
		args.push('-hide_banner');
	args.push('-autoexit');
	args.push('-i');
	let downloadUrl = await getUrl(url, printToConsole);
	if (downloadUrl.substring(0, 4) != 'http') {
		console.error(`Doesn't start with http: ${downloadUrl}`);
		return null;
	}
	args.push(downloadUrl);
	if (!checkAccessible(downloadUrl))
		throw new Error('Stream could not be found');
	let child = spawn('ffplay', args);
	child.stdout.on('data', data => {
		console.log(data.toString());
	});
	child.stderr.on('data', data => {
		console.error(data.toString());
	});
	child.on('error', error => {
		console.error(`error: ${error.message}`);
	});
	child.on('exit', (code, signal) => {
		if (code) console.log(`Process exited with code: ${code}`);
		if (signal) console.log(`Process killed with signal: ${signal}`);
	});
	return child;
}

async function getDownloadProcess(url, filepath, printUrlToConsole, showBanner) {
	let args = [];
	if (!showBanner)
		args.push('-hide_banner');
	args.push('-i');
	let downloadUrl = await getUrl(url, printUrlToConsole);
	if (downloadUrl.substring(0, 4) != 'http') {
		console.error(`Doesn't start with http: ${downloadUrl}`);
		return null;
	}
	args.push(downloadUrl);
	args.push(filepath);
	if (!checkAccessible(downloadUrl))
		throw new Error('Stream could not be found');
	let child = spawn('ffmpeg', args);
	child.stdout.on('data', data => {
		console.log(data.toString());
	});
	child.stderr.on('data', data => {
		console.error(data.toString());
	});
	child.on('error', error => {
		console.error(`error: ${error.message}`);
	});
	child.on('exit', (code, signal) => {
		if (code) console.log(`Process exited with code: ${code}`);
		if (signal) console.log(`Process killed with signal: ${signal}`);
	});
	return child;
}

async function preview(url, printUrlToConsole, showBanner, waitFor) {
	let child = null;
	try {
		child = getPreviewProcess(url, printUrlToConsole, showBanner);
		if (child == null)
			console.error("Error - Check your entered values or internet connection");
	} catch (e) {
		if (waitFor) {
			let interval = setInterval(async () => {
				let previewUrl = await getUrl(url);
				if (checkAccessible(previewUrl))
					clearInterval(interval);
				else
					console.log(`${url}: 404 Not Found`);
			}, 60 * 1000); // 1 Minute
		} else {
			let readline = require('readline').createInterface({
				input: process.stdin,
				output: process.stdout
			});
			readline.question('Should I wait for the stream to go online (y,n): ', input => {
				let mayRun = true;
				if (!input.toLowerCase() == 'y' && !input.toLowerCase() == 'n') {
					console.log('Please either type y or n!');
					mayRun = false;
				}
				readline.close();
				if (mayRun && input.toLowerCase() == 'y')
					preview(url, printUrlToConsole, showBanner, true);
			});
		}
	}
	if (child == null)
		return;
	console.log('ffplay should get started. When not then ffmpeg is not installed or not in the PATH. You can get it from https://ffmpeg.org/');
}

async function download(url, filepath, printUrlToConsole, showBanner, waitFor) {
	let child = null;
	try {
		child = getDownloadProcess(url, filepath, printUrlToConsole, showBanner);
		if (child == null)
			console.error("Error - Check your entered values or internet connection");
	} catch (e) {
		if (waitFor) {
			let interval = setInterval(async () => {
				let downloadUrl = await getUrl(url);
				if (checkAccessible(downloadUrl))
					clearInterval(interval);
				else
					console.log(`${url}: 404 Not Found`);
			}, 60 * 1000); // 1 Minute
		} else {
			let readline = require('readline').createInterface({
				input: process.stdin,
				output: process.stdout
			});
			readline.question('Should I wait for the stream to go online (y,n): ', input => {
				let mayRun = true;
				if (!input.toLowerCase() == 'y' && !input.toLowerCase() == 'n') {
					console.log('Please either type y or n!');
					mayRun = false;
				}
				readline.close();
				if (mayRun && input.toLowerCase() == 'y')
					download(url, filepath, printUrlToConsole, showBanner, true);
			});
		}
	}
	if (child == null)
		return;
	console.log('ffmpeg should get started. When not then ffmpeg is not installed or not in the PATH. You can get it from https://ffmpeg.org/');
}

async function getUrl(url, printToConsole = false) {
	if (url.indexOf('?') > -1)
		url = url.substring(0, url.indexOf('?'));
	let isLive = url.indexOf('/videos/') < 0;
	let isClip = url.indexOf('clip') > -1;
	let channel = url.replace(/^.+\/(.+?)$/g, '$1');
	let vodId = '';
	if (!isLive && !isClip) {
		let tokenInfo = await fetch(`https://id.twitch.tv/oauth2/token?client_id=${process.env.TWITCH_CLIENT_ID}&client_secret=${process.env.TWITCH_CLIENT_SECRET}&grant_type=client_credentials`, {
			method: 'POST'
		}).then(res => res.json());
		let videoInfo = await fetch(`https://api.twitch.tv/helix/videos?id=${channel}`, {
			headers: {
				'Client-ID': process.env.TWITCH_CLIENT_ID,
				'Authorization': `Bearer ${tokenInfo.access_token}`
			}
		}).then(res => res.json());
		vodId = channel;
		channel = videoInfo.data[0].user_login; //.user_name (Display Name)
	}
	if (!isLive && isClip) {
		let tokenInfo = await fetch(`https://id.twitch.tv/oauth2/token?client_id=${process.env.TWITCH_CLIENT_ID}&client_secret=${process.env.TWITCH_CLIENT_SECRET}&grant_type=client_credentials`, {
			method: 'POST'
		}).then(res => res.json());
		let clipInfo = await fetch(`https://api.twitch.tv/helix/clips?id=${channel}`, {
			headers: {
				'Client-ID': process.env.TWITCH_CLIENT_ID,
				'Authorization': `Bearer ${tokenInfo.access_token}`
			}
		}).then(res => res.json());
		vodId = channel;
		channel = clipInfo.data[0].broadcaster_name.toLowerCase();
	}
	let body = '';
	if (isClip)
		body = `[{"operationName":"VideoAccessToken_Clip","variables":{"slug":"${vodId}"},"extensions":{"persistedQuery":{"version":1,"sha256Hash":"36b89d2507fce29e5ca551df756d27c1cfe079e2609642b4390aa4c35796eb11"}}}]`;
	else
		body = `{"operationName":"PlaybackAccessToken_Template","query":"query PlaybackAccessToken_Template($login: String!, $isLive: Boolean!, $vodID: ID!, $isVod: Boolean!, $playerType: String!) { streamPlaybackAccessToken(channelName: $login, params: {platform:\\"web\\", playerBackend: \\"mediaplayer\\", playerType: $playerType}) @include(if: $isLive) {    value    signature    __typename  }  videoPlaybackAccessToken(id: $vodID, params: {platform: \\"web\\", playerBackend: \\"mediaplayer\\", playerType: $playerType}) @include(if: $isVod) {    value    signature    __typename  }}","variables":{"isLive":"${isLive ? 'true' : 'false'}","login":"${channel}","isVod":"${!isLive ? 'true' : 'false'}","vodID":"${vodId}","playerType":"site"}}`;
	let gql = await fetch(`https://gql.twitch.tv/gql`, {
		method: 'POST',
		headers: {
			'Client-ID': 'kimne78kx3ncx6brgo4mv6wki5h1ko',
			'Content-Type': 'text/plain; charset=UTF-8',
			'Origin': 'https://www.twitch.tv',
			'DNT': '1',
			'Sec-GPC': '1'
		},
		body
	}).then(res => res.json());
	if (isClip)
		gql = {array: gql};
	//console.log(`gql: ${JSON.stringify(gql)}`);
	let signature = '';
	let access_token = '';
	try {
		if (isClip) {
			let clip = gql.array[0].data.clip;
			let playbackAccessToken = clip.playbackAccessToken;
			signature = playbackAccessToken.signature;
			access_token = playbackAccessToken.value;
			let videoQualities = clip.videoQualities;
			let qualities = [];
			let lastQuality = 0;
			let bestIndex = -1;
			for (let i = 0; i < videoQualities.length; i++) {
				let videoQuality = videoQualities[i];
				let quality = videoQuality.quality;
				if (lastQuality < quality) {
					lastQuality = quality;
					bestIndex = i;
				}
				let sourceUrl = `${videoQuality.sourceURL}?sig=${signature}&token=${encodeURIComponent(access_token)}`;
				qualities[i] = {
					frameRate: videoQuality.frameRate,
					quality,
					sourceURL: sourceUrl
				};
			}
			if (bestIndex < 0)
				return null;
			return qualities[bestIndex].sourceURL;
		} else if (isLive) {
			let streamPlaybackAccessToken = gql.data.streamPlaybackAccessToken;
			signature = streamPlaybackAccessToken.signature;
			access_token = streamPlaybackAccessToken.value;
		} else {
			let videoPlaybackAccessToken = gql.data.videoPlaybackAccessToken;
			signature = videoPlaybackAccessToken.signature;
			access_token = videoPlaybackAccessToken.value;
		}
		let result = `${isLive ? 'https://usher.ttvnw.net/api/channel/hls/' + channel : 'https://usher.ttvnw.net/vod/' + vodId}.m3u8?sig=${encodeURIComponent(signature)}&token=${encodeURIComponent(access_token)}&allow_source=true&fast_bread=true&cdm=wv&reassignments_supported=true&playlist_include_framerate=true&player_backend=mediaplayer`;
		if (printToConsole)
			console.log(`Download-URL: ${result}`);
		return result;
	} catch (e) {
		console.error(e.stack);
	}
}
