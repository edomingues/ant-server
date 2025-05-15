
// use imports
import { authenticate } from '@google-cloud/local-auth';
import { google } from 'googleapis';	
import fs from 'fs';
import os from 'os';
import path from 'path';
import express from 'express';


const SCOPES = ['https://www.googleapis.com/auth/drive.file'];
// The file token.json stores the user's access and refresh tokens, and is
// created automatically when the authorization flow completes for the first
// time.
const TOKEN_PATH = path.join(process.cwd(), 'token.json');
const CREDENTIALS_PATH = path.join(process.cwd(), 'credentials.json');

/**
 * Reads previously authorized credentials from the save file.
 *
 * @return {Promise<OAuth2Client|null>}
 */
async function loadSavedCredentialsIfExist() {
  try {
    const content = await fs.promises.readFile(TOKEN_PATH);
    const credentials = JSON.parse(content);
    return google.auth.fromJSON(credentials);
  } catch (err) {
    return null;
  }
}

/**
 * Serializes credentials to a file compatible with GoogleAuth.fromJSON.
 *
 * @param {OAuth2Client} client
 * @return {Promise<void>}
 */
async function saveCredentials(client) {
  const content = await fs.promises.readFile(CREDENTIALS_PATH);
  const keys = JSON.parse(content);
  const key = keys.installed || keys.web;
  const payload = JSON.stringify({
    type: 'authorized_user',
    client_id: key.client_id,
    client_secret: key.client_secret,
    refresh_token: client.credentials.refresh_token,
  });
  await fs.promises.writeFile(TOKEN_PATH, payload);
}

/**
 * Load or request or authorization to call APIs.
 *
 */
async function authorize() {
  let client = await loadSavedCredentialsIfExist();
  if (client) {
    return client;
  }
  client = await authenticate({
    scopes: SCOPES,
    keyfilePath: CREDENTIALS_PATH,
  });
  if (client.credentials) {
    await saveCredentials(client);
  }
  return client;
}

async function localAuthClient() {
	return await authorize();
}

async function googleAuthClient() {
	return await google.auth.getClient({
		scopes: SCOPES
	});
}

// const authClient = await localAuthClient(); // Run locally
const authClient = await googleAuthClient(); // Run in firebase functions
const drive = google.drive({version: 'v3', auth: authClient});

function handleRequest(req, res) {
	console.log("Handle request");

	if (req.method !== 'POST') {
	  res.status(405).send('Method Not Allowed');
	  return;
	}

	const contentType = req.headers['content-type'];
	if (!contentType || !contentType.includes('multipart/form-data')) {
		console.log('Invalid content-type. Expected multipart/form-data but was ' + contentType);
		res.status(400).send('Invalid content-type');
		return;
	}

	// Extract boundary
	const boundaryMatch = contentType.match(/boundary=(.*)$/);
	if (!boundaryMatch) {
	  res.status(400).send('No boundary found in content-type header');
	  return;
	}
	const boundary = boundaryMatch[1];

	// Collect raw request body
	let body = Buffer.alloc(0);
	req.on('data', (chunk) => {
		body = Buffer.concat([body, chunk]);
	});

	req.on('end', async () => {
		const parts = body.toString().split(`--${boundary}`);

		// Find file part
		const filePart = parts.find(part =>
			part.includes('Content-Disposition: form-data;') &&
			part.includes('filename=')
		);

		if (!filePart) {
			res.status(400).send('No file part found in form-data');
			return;
		}

		// Extract filename
		const filenameMatch = filePart.match(/filename="(.+?)"/);
		if (!filenameMatch) {
			res.status(400).send('Filename not found in file part');
			return;
		}
		const filename = filenameMatch[1];

		// Find content type (optional)
		const contentTypeMatch = filePart.match(/Content-Type: (.+)/);
		const mimeType = contentTypeMatch ? contentTypeMatch[1].trim() : 'application/octet-stream';

		// Extract file content after double CRLF
		const fileContentStart = filePart.indexOf('\r\n\r\n') + 4;
		const fileContentEnd = filePart.lastIndexOf('\r\n');
		const fileContent = filePart.substring(fileContentStart, fileContentEnd);

		// Write file to temp location
		const filePath = path.join(os.tmpdir(), filename);
		fs.writeFileSync(filePath, fileContent, 'binary');

		console.log(`File saved to ${filePath}`);

		const folderId = process.env.GOOGLE_DRIVE_FOLDER_ID;

		try {
			const file = await drive.files.create({
				requestBody: { 
					name: filename, 
					fields: 'id',
					parents: [folderId],
				},
				media: {
					mimeType: mimeType,
					body: fs.createReadStream(filePath)
				},
			});
			console.log('File Id:', file.data.id);

			// Clean up temp file
			fs.unlinkSync(filePath);

			res.status(200).send("ANT: OK").end();
		} catch (error) {
			console.error(error);
			res.status(200).send("ANT: ERR " + error).end();
		}
	});
}

const app = express();

app.use(express.static('public'));

app.post('/', (req, res) => {
	handleRequest(req, res);
});

app.listen(8080, () => {
	console.log('Server running on port 8080');
});
