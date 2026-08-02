export type RoleCode = 'superuser' | 'personnel' | 'drone' | 'screen';
export type PresenceStatus = 'online' | 'idle' | 'offline';
export type Priority = 'low' | 'medium' | 'high' | 'critical';

export interface AuthUser {
  id: number;
  username: string;
  fullName: string;
  role: RoleCode;
  unitId: number | null;
  unitName: string | null;
  permissions: string[];
  phone?: string | null;
  photoUrl?: string | null;
  badgeNumber?: string | null;
  status?: PresenceStatus;
  battery?: number | null;
}

export interface Unit {
  id: number;
  code: string;
  name: string;
  color: string;
  total: number;
  online: number;
}

export interface Personnel {
  id: number;
  fullName: string;
  username: string;
  phone: string | null;
  photoUrl: string | null;
  badgeNumber: string | null;
  status: PresenceStatus;
  battery: number | null;
  signal: number | null;
  lat: number | null;
  lng: number | null;
  lastSeenAt: string | null;
  unit: { id: number; name: string; code: string; color: string } | null;
  stream: { id: number; roomName: string } | null;
  mission: { id: number; title: string; priority: Priority; status: string } | null;
}

export interface DashboardStats {
  personnelActive: number;
  personnelTotal: number;
  onlinePercent: number;
  streamingNow: number;
  openIncidents: number;
  reportsToday: number;
  pendingMissions: number;
}

export interface Report {
  id: number;
  type: 'information' | 'incident' | 'request_help';
  title: string | null;
  description: string;
  lat: number | null;
  lng: number | null;
  status: 'pending' | 'verified' | 'rejected';
  createdAt: string;
  verifiedAt: string | null;
  verifiedByName: string | null;
  reporter: { id: number; fullName: string; badgeNumber: string | null; unitName: string | null };
  media: Array<{ id: number; kind: 'photo' | 'video'; url: string }>;
}

export interface Mission {
  id: number;
  title: string;
  description: string | null;
  priority: Priority;
  status: 'pending' | 'running' | 'completed' | 'cancelled';
  lat: number | null;
  lng: number | null;
  deadline: string | null;
  createdAt: string;
  completedAt: string | null;
  commanderName: string | null;
  assignees: Array<{
    id: number;
    fullName: string;
    badgeNumber: string | null;
    unitName: string | null;
    status: string;
  }>;
}

export interface Incident {
  id: number;
  title: string;
  description: string | null;
  priority: Priority;
  status: 'open' | 'investigating' | 'closed';
  location: string | null;
  lat: number | null;
  lng: number | null;
  createdAt: string;
  closedAt: string | null;
  reporter: { id: number; fullName: string } | null;
  assignee: { id: number; fullName: string } | null;
}

export interface Stream {
  id: number;
  roomName: string;
  status: 'live' | 'ended';
  quality: 'good' | 'fair' | 'poor';
  startedAt: string;
  endedAt: string | null;
  officer: {
    id: number;
    fullName: string;
    badgeNumber: string | null;
    unitName: string | null;
    unitColor: string | null;
  };
}

export interface Activity {
  id: number;
  type: string;
  message: string;
  refType: string | null;
  refId: number | null;
  userName: string | null;
  createdAt: string;
}

export interface AppNotification {
  id: number;
  type: string;
  title: string;
  body: string | null;
  severity: 'info' | 'success' | 'warning' | 'danger';
  refType: string | null;
  refId: number | null;
  read: boolean;
  createdAt: string;
}

export interface ChatMessage {
  id: number;
  senderId: number;
  receiverId: number;
  senderName?: string;
  body: string;
  read: boolean;
  createdAt: string;
}

export interface MapData {
  personnel: Array<{
    id: number;
    fullName: string;
    status: PresenceStatus;
    battery: number | null;
    lat: number;
    lng: number;
    unitName: string | null;
    streaming: boolean;
    lastSeenAt: string | null;
  }>;
  incidents: Array<{
    id: number;
    title: string;
    priority: Priority;
    status: string;
    location: string | null;
    lat: number;
    lng: number;
    createdAt: string;
  }>;
  reports: Array<{
    id: number;
    type: string;
    title: string | null;
    status: string;
    lat: number;
    lng: number;
    userName: string;
    createdAt: string;
  }>;
  missions: Array<{
    id: number;
    title: string;
    priority: Priority;
    status: string;
    lat: number;
    lng: number;
  }>;
}

export interface Operation {
  id: number;
  name: string;
  code: string;
  description: string | null;
  status: string;
  center: { lat: number; lng: number };
  startedAt: string;
}
