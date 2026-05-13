import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import express from 'express';
import cors from 'cors';
import {
  ConnectClient,
  StartOutboundVoiceContactCommand,
  StopContactCommand,
} from '@aws-sdk/client-connect';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '.env') });

export const config = {
  region: process.env.AWS_REGION || 'us-east-1',
  instanceId: process.env.CONNECT_INSTANCE_ID,
  contactFlowId: process.env.CONNECT_CONTACT_FLOW_ID,
  sourcePhoneNumber: process.env.SOURCE_PHONE_NUMBER,
  port: Number(process.env.PORT || 8787),
};

export const missingConfig = Object.entries({
  AWS_REGION: config.region,
  CONNECT_INSTANCE_ID: config.instanceId,
  CONNECT_CONTACT_FLOW_ID: config.contactFlowId,
  SOURCE_PHONE_NUMBER: config.sourcePhoneNumber,
}).filter(([, value]) => !value).map(([key]) => key);

const connect = new ConnectClient({ region: config.region });

function toE164(raw) {
  const value = String(raw || '').trim();
  const digits = value.replace(/\D/g, '');

  if (!digits) return null;
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  if (/^\+[1-9]\d{1,14}$/.test(value)) return value;
  return null;
}

function callAttributes({ contactId, name }) {
  const attributes = {};

  if (contactId) attributes.dialerContactId = String(contactId).slice(0, 256);
  if (name) attributes.dialerContactName = String(name).slice(0, 256);

  return Object.keys(attributes).length > 0 ? attributes : undefined;
}

function ensureConfigured(res) {
  if (missingConfig.length === 0) return true;

  res.status(500).json({
    error: 'ServerMisconfigured',
    message: `Missing required environment variables: ${missingConfig.join(', ')}`,
  });
  return false;
}

export function createApp({ serveStatic = false } = {}) {
  const app = express();

  app.use(cors());
  app.use(express.json());
  app.use((req, _res, next) => {
    if (Buffer.isBuffer(req.body)) {
      try {
        req.body = JSON.parse(req.body.toString('utf8'));
      } catch {
        req.body = {};
      }
    } else if (typeof req.body === 'string') {
      try {
        req.body = JSON.parse(req.body);
      } catch {
        req.body = {};
      }
    }
    next();
  });

  app.get('/api/call/config', (_req, res) => {
    res.json({
      ok: missingConfig.length === 0,
      region: config.region,
      instanceId: config.instanceId || null,
      contactFlowId: config.contactFlowId || null,
      sourcePhoneNumber: config.sourcePhoneNumber || null,
      missing: missingConfig,
    });
  });

  app.post('/api/call', async (req, res) => {
    if (!ensureConfigured(res)) return;

    const { phone, contactId, name } = req.body || {};
    const destination = toE164(phone);

    if (!destination) {
      res.status(400).json({
        error: 'InvalidPhoneNumber',
        message: 'Phone number must be 10 digits or already be in E.164 format.',
      });
      return;
    }

    try {
      const out = await connect.send(new StartOutboundVoiceContactCommand({
        InstanceId: config.instanceId,
        ContactFlowId: config.contactFlowId,
        DestinationPhoneNumber: destination,
        SourcePhoneNumber: config.sourcePhoneNumber,
        Name: name ? String(name).slice(0, 1024) : undefined,
        Description: contactId
          ? `Dialer outbound call for contact ${String(contactId).slice(0, 256)}`
          : 'Dialer outbound call',
        Attributes: callAttributes({ contactId, name }),
      }));

      res.json({
        ok: true,
        contactId: out.ContactId,
        destinationPhoneNumber: destination,
        sourcePhoneNumber: config.sourcePhoneNumber,
      });
    } catch (error) {
      console.error('Connect start call error:', error);
      res.status(502).json({
        error: error.name || 'CallFailed',
        message: error.message || 'Failed to start outbound voice contact.',
      });
    }
  });

  app.post('/api/call/stop', async (req, res) => {
    if (!ensureConfigured(res)) return;

    const contactId = String(req.body?.contactId || '').trim();
    if (!contactId) {
      res.status(400).json({
        error: 'MissingContactId',
        message: 'contactId is required to stop a live Connect contact.',
      });
      return;
    }

    try {
      await connect.send(new StopContactCommand({
        InstanceId: config.instanceId,
        ContactId: contactId,
      }));

      res.json({ ok: true, contactId });
    } catch (error) {
      console.error('Connect stop call error:', error);
      res.status(502).json({
        error: error.name || 'StopCallFailed',
        message: error.message || 'Failed to stop outbound voice contact.',
      });
    }
  });

  app.get('/health', (_req, res) => {
    res.json({
      ok: missingConfig.length === 0,
      region: config.region,
      sourcePhoneNumber: config.sourcePhoneNumber || null,
    });
  });

  if (serveStatic) {
    app.use(express.static(path.join(__dirname, '..')));
    app.get('/', (_req, res) => {
      res.sendFile(path.join(__dirname, '..', 'index.html'));
    });
  }

  return app;
}
