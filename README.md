# ant-server

Server for ANT Answer'N'Time Recorder (https://ant.yq.cz/)

This server allows to:

1. host the ANT configuration (INI) file;
2. host the start list;
3. receive results from ANT and store them in Google Drive.

## Run

To run the server export a `service-account.json` from Google API and give permissions to access the Google Drive folder. Set the folder ID in the environment variable `GOOGLE_DRIVE_FOLDER_ID` in the `.env` file. Then run:

    docker compose up
