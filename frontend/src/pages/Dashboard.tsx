import { useQuery, useQueryClient } from '@tanstack/react-query';
import { MessageSquare } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import ChatDrawer from '../components/dashboard/ChatDrawer';
import DashboardFooter from '../components/dashboard/DashboardFooter';
import DashboardHeader from '../components/dashboard/DashboardHeader';
import IncidentPanel from '../components/dashboard/IncidentPanel';
import MapPanel from '../components/dashboard/MapPanel';
import MissionPanel from '../components/dashboard/MissionPanel';
import NotificationPanel from '../components/dashboard/NotificationPanel';
import PersonnelDetail from '../components/dashboard/PersonnelDetail';
import PersonnelPanel from '../components/dashboard/PersonnelPanel';
import ReportsPanel from '../components/dashboard/ReportsPanel';
import StatsCards from '../components/dashboard/StatsCards';
import StreamingPanel from '../components/dashboard/StreamingPanel';
import TimelinePanel from '../components/dashboard/TimelinePanel';
import { useLiveStreams } from '../hooks/useLiveStreams';
import { useSocketEvent } from '../hooks/useSocketEvent';
import { api } from '../lib/api';
import type {
  Activity,
  AppNotification,
  DashboardStats,
  Incident,
  MapData,
  Mission,
  Operation,
  Personnel,
  Report,
  Unit,
} from '../lib/types';

const get = async <T,>(url: string, params?: Record<string, unknown>): Promise<T> => {
  const { data } = await api.get<T>(url, { params });
  return data;
};

export default function Dashboard() {
  const queryClient = useQueryClient();

  const [selectedPersonnel, setSelectedPersonnel] = useState<number | null>(null);
  const [expandedStream, setExpandedStream] = useState<number | null>(null);
  const [missionForPersonnel, setMissionForPersonnel] = useState<number | null>(null);
  const [chatOpen, setChatOpen] = useState(false);
  const [chatPartner, setChatPartner] = useState<number | null>(null);

  /* ----------------------------------------------------------- queries --- */

  const operation = useQuery({
    queryKey: ['operation'],
    queryFn: () => get<{ operation: Operation | null }>('/dashboard/operation'),
    staleTime: 5 * 60_000,
  });

  const stats = useQuery({
    queryKey: ['stats'],
    queryFn: () => get<{ stats: DashboardStats }>('/dashboard/stats'),
  });

  const units = useQuery({
    queryKey: ['units'],
    queryFn: () => get<{ units: Unit[] }>('/dashboard/units'),
    staleTime: 60_000,
  });

  const personnel = useQuery({
    queryKey: ['personnel'],
    queryFn: () => get<{ personnel: Personnel[] }>('/personnel'),
  });

  const mapData = useQuery({
    queryKey: ['map'],
    queryFn: () => get<MapData>('/dashboard/map'),
  });

  const streams = useLiveStreams();

  const activity = useQuery({
    queryKey: ['activity'],
    queryFn: () => get<{ activity: Activity[] }>('/dashboard/activity', { limit: 40 }),
  });

  const incidents = useQuery({
    queryKey: ['incidents'],
    queryFn: () => get<{ incidents: Incident[] }>('/incidents', { limit: 50 }),
  });

  const missions = useQuery({
    queryKey: ['missions'],
    queryFn: () => get<{ missions: Mission[] }>('/missions', { limit: 60 }),
  });

  const notifications = useQuery({
    queryKey: ['notifications'],
    queryFn: () => get<{ notifications: AppNotification[] }>('/notifications', { limit: 50 }),
  });

  const reports = useQuery({
    queryKey: ['reports'],
    queryFn: () => get<{ reports: Report[] }>('/reports', { limit: 60 }),
  });

  /* ---------------------------------------------------------- realtime --- */

  const invalidate = useCallback(
    (keys: string[]) => {
      for (const key of keys) void queryClient.invalidateQueries({ queryKey: [key] });
    },
    [queryClient]
  );

  // GPS pings arrive up to 10×/second across 100 personnel, so map/personnel
  // refetches are coalesced into one call per second instead of one per event.
  const locationTimer = useRef<number | null>(null);
  const scheduleLocationRefresh = useCallback(() => {
    if (locationTimer.current != null) return;
    locationTimer.current = window.setTimeout(() => {
      locationTimer.current = null;
      invalidate(['map', 'personnel']);
    }, 1000);
  }, [invalidate]);

  useEffect(
    () => () => {
      if (locationTimer.current != null) window.clearTimeout(locationTimer.current);
    },
    []
  );

  useSocketEvent('location_updated', scheduleLocationRefresh);
  useSocketEvent('user_online', () => invalidate(['personnel', 'stats', 'map']));
  useSocketEvent('user_offline', () => invalidate(['personnel', 'stats', 'map']));

  useSocketEvent<DashboardStats>('stats_updated', (next) => {
    queryClient.setQueryData(['stats'], { stats: next });
  });

  useSocketEvent<Activity>('activity', (item) => {
    queryClient.setQueryData<{ activity: Activity[] }>(['activity'], (prev) =>
      prev ? { activity: [item, ...prev.activity].slice(0, 60) } : { activity: [item] }
    );
  });

  useSocketEvent<AppNotification>('notification', (item) => {
    queryClient.setQueryData<{ notifications: AppNotification[] }>(['notifications'], (prev) =>
      prev
        ? { notifications: [item, ...prev.notifications].slice(0, 60) }
        : { notifications: [item] }
    );
  });

  useSocketEvent('report_created', () => invalidate(['reports', 'stats', 'map']));
  useSocketEvent('report_updated', () => invalidate(['reports', 'map']));
  useSocketEvent('report_deleted', () => invalidate(['reports', 'stats', 'map']));
  useSocketEvent('mission_created', () => invalidate(['missions', 'stats', 'personnel', 'map']));
  useSocketEvent('mission_completed', () => invalidate(['missions', 'stats', 'personnel', 'map']));
  useSocketEvent('incident_created', () => invalidate(['incidents', 'stats', 'map']));
  useSocketEvent('incident_updated', () => invalidate(['incidents', 'stats', 'map']));
  useSocketEvent('stream_started', () => invalidate(['streams', 'stats', 'personnel', 'map']));
  useSocketEvent('stream_stopped', () => invalidate(['streams', 'stats', 'personnel', 'map']));

  // Global search results jump straight to the relevant panel.
  useEffect(() => {
    const onSelect = (event: Event) => {
      const detail = (event as CustomEvent<{ type: string; id: number }>).detail;
      if (detail?.type === 'personnel') setSelectedPersonnel(detail.id);
    };
    window.addEventListener('tocs:search-select', onSelect);
    return () => window.removeEventListener('tocs:search-select', onSelect);
  }, []);

  /* ------------------------------------------------------------ render --- */

  return (
    <div className="flex min-h-screen flex-col bg-canvas">
      <DashboardHeader operation={operation.data?.operation} />

      <main className="flex-1 space-y-4 px-4 py-4 lg:px-6">
        <StatsCards stats={stats.data?.stats} />

        {/*
          Bands get an explicit height on large screens: panels scroll internally
          instead of stretching their row, which is what keeps a 100-row personnel
          table from pushing the map and stream grid off the fold.
        */}
        {/* Band 1 — situational awareness */}
        <div className="grid grid-cols-1 gap-4 xl:h-[34rem] xl:grid-cols-12">
          <div className="min-h-0 xl:col-span-6">
            <MapPanel
              data={mapData.data}
              operation={operation.data?.operation}
              loading={mapData.isLoading}
              onSelectPersonnel={setSelectedPersonnel}
            />
          </div>
          <div className="min-h-0 xl:col-span-3">
            <PersonnelPanel
              personnel={personnel.data?.personnel ?? []}
              units={units.data?.units ?? []}
              loading={personnel.isLoading}
              onSelect={setSelectedPersonnel}
            />
          </div>
          <div className="min-h-0 xl:col-span-3">
            <StreamingPanel
              streams={streams.data ?? []}
              loading={streams.isLoading}
              expandedId={expandedStream}
              onExpandedChange={setExpandedStream}
            />
          </div>
        </div>

        {/* Band 2 — activity & incidents */}
        <div className="grid grid-cols-1 gap-4 xl:h-[26rem] xl:grid-cols-12">
          <div className="min-h-0 xl:col-span-4">
            <TimelinePanel activity={activity.data?.activity ?? []} loading={activity.isLoading} />
          </div>
          <div className="min-h-0 xl:col-span-8">
            <IncidentPanel
              incidents={incidents.data?.incidents ?? []}
              personnel={personnel.data?.personnel ?? []}
              loading={incidents.isLoading}
            />
          </div>
        </div>

        {/* Band 3 — missions & notifications */}
        <div className="grid grid-cols-1 gap-4 xl:h-[26rem] xl:grid-cols-12">
          <div className="min-h-0 xl:col-span-8">
            <MissionPanel
              missions={missions.data?.missions ?? []}
              personnel={personnel.data?.personnel ?? []}
              loading={missions.isLoading}
              createFor={missionForPersonnel}
              onCreateForHandled={() => setMissionForPersonnel(null)}
            />
          </div>
          <div className="min-h-0 xl:col-span-4">
            <NotificationPanel
              notifications={notifications.data?.notifications ?? []}
              loading={notifications.isLoading}
            />
          </div>
        </div>

        {/* Band 4 — field reports */}
        <div className="xl:h-[24rem]">
          <ReportsPanel reports={reports.data?.reports ?? []} loading={reports.isLoading} />
        </div>
      </main>

      <DashboardFooter
        operation={operation.data?.operation}
        units={units.data?.units ?? []}
        stats={stats.data?.stats}
      />

      {/* Floating chat */}
      <button
        type="button"
        onClick={() => setChatOpen(true)}
        className="fixed bottom-5 right-5 z-[800] grid h-14 w-14 place-items-center rounded-full bg-accent text-white shadow-lift transition-transform hover:scale-105"
        aria-label="Buka pesan"
      >
        <MessageSquare size={22} />
      </button>

      <ChatDrawer
        open={chatOpen}
        onClose={() => setChatOpen(false)}
        activePartnerId={chatPartner}
        onActivePartnerChange={setChatPartner}
      />

      <PersonnelDetail
        personnelId={selectedPersonnel}
        onClose={() => setSelectedPersonnel(null)}
        onWatchStream={(streamId) => {
          setSelectedPersonnel(null);
          setExpandedStream(streamId);
        }}
        onAssignMission={(id) => {
          setSelectedPersonnel(null);
          setMissionForPersonnel(id);
        }}
        onOpenChat={(id) => {
          setSelectedPersonnel(null);
          setChatPartner(id);
          setChatOpen(true);
        }}
      />
    </div>
  );
}
