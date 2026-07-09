import fs from 'fs';
import path from 'path';
import { P1Ticket, AccessRequest, normalizeSupportGroup } from '../src/types';

const DATA_DIR = path.join(process.cwd(), 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

export interface DatabaseSchema {
  tickets: P1Ticket[];
  mailLogs: any[];
  accessRequests: AccessRequest[];
}

const INITIAL_TICKETS: P1Ticket[] = [];

export function getDb(): DatabaseSchema {
  if (!fs.existsSync(DB_FILE)) {
    const initialDb: DatabaseSchema = {
      tickets: INITIAL_TICKETS,
      mailLogs: [],
      accessRequests: [],
    };
    saveDb(initialDb);
    return initialDb;
  }

  try {
    const raw = fs.readFileSync(DB_FILE, 'utf-8');
    const parsed = JSON.parse(raw);

    // Normalize loaded ticket support groups resiliently
    const tickets: P1Ticket[] = (parsed.tickets || INITIAL_TICKETS).map((ticket: any) => ({
      ...ticket,
      supportGroup: normalizeSupportGroup(ticket.supportGroup),
      updatedBy: ticket.updatedBy ? normalizeSupportGroup(ticket.updatedBy) : ticket.updatedBy,
    }));

    return {
      tickets,
      mailLogs: parsed.mailLogs || [],
      accessRequests: parsed.accessRequests || [],
    };
  } catch (error) {
    console.error('Error reading database file, rebuilding default:', error);
    return {
      tickets: INITIAL_TICKETS,
      mailLogs: [],
      accessRequests: [],
    };
  }
}

export function saveDb(data: DatabaseSchema): void {
  try {
    fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2), 'utf-8');
  } catch (error) {
    console.error('Error writing to database file:', error);
  }
}
