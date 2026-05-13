# Amplify Deployment Notes

The dialer UI is static and can be hosted directly by Amplify Hosting.
The call API still needs compute. Amplify Hosting alone does not run the
local `backend/server.js` process.

## 1. Host the frontend in Amplify

- Connect this repo in Amplify Hosting.
- The included `amplify.yml` publishes `index.html` and `config.js`.

## 2. Deploy the call API as Lambda or an Amplify function

Use [backend/lambda.js](backend/lambda.js) as the handler entrypoint.
Set these environment variables in the function:

- `AWS_REGION=us-east-1`
- `CONNECT_INSTANCE_ID=acfb0bc2-784c-43a3-9814-5f5b62502714`
- `CONNECT_CONTACT_FLOW_ID=ddeb7c7f-9256-4a4d-a3a2-6ab50b40bdd6`
- `SOURCE_PHONE_NUMBER=+19544954649`

Your API needs two routes:

- `POST /api/call`
- `POST /api/call/stop`

## 3. Point the static app at the deployed API

Edit [config.js](config.js) with your deployed API URL and CCP URL:

```js
window.DIALER_CONFIG = {
  callApi: 'https://your-api-id.execute-api.us-east-1.amazonaws.com/prod/api/call',
  callStopApi: 'https://your-api-id.execute-api.us-east-1.amazonaws.com/prod/api/call/stop',
  ccpUrl: 'https://manualdialer20260414195157.my.connect.aws/ccp-v2/',
};
```

## 4. Approve the Amplify origin in Amazon Connect

`http://localhost:8787` is already approved for local embedding.
After Amplify gives you a production URL, add that exact origin too:

```bash
aws connect associate-approved-origin \
  --instance-id acfb0bc2-784c-43a3-9814-5f5b62502714 \
  --origin https://YOUR-AMPLIFY-DOMAIN \
  --region us-east-1
```
