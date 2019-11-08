import Axios from "axios";
import CryptoJS from "crypto-js";
import express from "express";

const baseURL = "https://twist.moe";
const key = "LXgIVP&PorO68Rq7dTx8N^lP!Fa5sGJ^*XK";
const headers = {
	"user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/74.0.3729.157 Safari/537.36",
	"referer": baseURL,
	// "x-access-token": "1rj2vRtegS8Y60B3w3qNZm5T2Q0TN2NR",
};

export const API = Axios.create({baseURL, headers});

export const getSources = async (slug) => {
	const sources = await API.get(`/api/anime/${slug}/sources`, {
		headers: {"x-access-token": "1rj2vRtegS8Y60B3w3qNZm5T2Q0TN2NR"},
	});
	return sources.data.map(data => {
		const bytes = CryptoJS.AES.decrypt(data.source, key);
		return {...data, "source": bytes.toString(CryptoJS.enc.Utf8).trim()};
	});
};

export const getEpisodeStream = async (url, range) => {
	const headers = range ? {"Range": range} : {};
	return await API.get(url, {responseType: "stream",
		headers: {...headers},
	});
};

const app = express();

app.use((req, res, next) => {
	res.header("Access-Control-Allow-Origin", "*");
	res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
	next();
});

app.get("/api/sources/:slug", ({params: {slug}}, res) => {
	getSources(slug).then(data => res.send(data));
});

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
