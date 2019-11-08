import Axios from "axios";
import CryptoJS from "crypto-js";
import express from "express";

const baseURL = "https://twist.moe";
const key = "LXgIVP&PorO68Rq7dTx8N^lP!Fa5sGJ^*XK";

// I just the chrome browser user-agent
const headers = {
	"user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/74.0.3729.157 Safari/537.36",
	"referer": baseURL,
	// "x-access-token": "1rj2vRtegS8Y60B3w3qNZm5T2Q0TN2NR",
};

export const API = Axios.create({baseURL, headers});

// gets all the sources based on the slug. a slug is a title from kitsu.
// TODO: standardize the slug here and in the horriblesubs router.
export const getSources = async (slug) => {
	const sources = await API.get(`/api/anime/${slug}/sources`, {
		headers: {"x-access-token": "1rj2vRtegS8Y60B3w3qNZm5T2Q0TN2NR"},
	});
	// we recieve the sources with encryption. let's decrypt it!
	return sources.data.map(data => {
		const bytes = CryptoJS.AES.decrypt(data.source, key);
		return {...data, "source": bytes.toString(CryptoJS.enc.Utf8).trim()};
	});
};

// just a proxy from the twist.moe nginx server.
// we're fooling it to think it's the official website requesting this data.
export const getEpisodeStream = async (url, range) => {
	const headers = range ? {"Range": range} : {};
	return await API.get(url, {responseType: "stream",
		headers: {...headers},
	});
};

const app = express();

// because the twist.moe nginx server returns headers that won't allow us to cross origin the data,
// let's create a middleware that changes those tokens to something more friendly.
// this is a possible security risk, but I couldn't care less.
app.use((req, res, next) => {
	res.header("Access-Control-Allow-Origin", "*");
	res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
	next();
});

// GET localhost:port/twist/api/sources/one-punch-man -> returns all of the sources for one punch man.
app.get("/api/sources/:slug", ({params: {slug}}, res) => {
	getSources(slug).then(data => res.send(data));
});

// GET localhost:port/twist/anime/onepunchman/something-0001.mp4 (or something like that)
// this is what the <video> tag url should be.
app.get("/anime/:title/:episode", ({params, headers: {range}}, res, next) => {
	const {title, episode} = params;
	const url = `/anime/${title}/${episode}`;
	getEpisodeStream(url, range).then(({data: stream, headers}) => {
		res.status(206);
		res.set({...headers});
		stream.pipe(res);
	}).catch(e => {
		console.error(e);
		next(e);
	});
});

export default app;
