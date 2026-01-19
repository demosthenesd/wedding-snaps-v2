import { Event } from "../models/Event.js";
import { getOauthClient } from "../services/google.js";

export async function startGoogleAuth(req, res) {
  const { eventId } = req.query;
  if (!eventId) return res.status(400).send("Missing eventId");

  const ev = await Event.findById(eventId);
  if (!ev) return res.status(404).send("Event not found");

  const url = getOauthClient().generateAuthUrl({
    access_type: "offline", // important for refresh_token
    prompt: "consent", // ensures refresh_token is returned
    scope: ["https://www.googleapis.com/auth/drive.file"],
    state: ev._id.toString(), // carry eventId through callback
  });

  res.redirect(url);
}

export async function handleOAuthCallback(req, res) {
  const { code, state } = req.query;
  if (!code || !state) return res.status(400).send("Missing code/state");

  const eventId = String(state);
  const ev = await Event.findById(eventId);
  if (!ev) return res.status(404).send("Event not found");

  const { tokens } = await getOauthClient().getToken(String(code));

  if (!tokens.refresh_token) {
    return res
      .status(400)
      .send(
        "No refresh_token returned. Remove app access from your Google Account and try again (or ensure prompt=consent)."
      );
  }

  ev.googleRefreshToken = tokens.refresh_token;
  await ev.save();

  const back = `https://candidsnaps.netlify.app/?e=${ev._id.toString()}`;
  res.redirect(back);
}
