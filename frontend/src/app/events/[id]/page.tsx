import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { CampusApp } from "@/components/CampusApp";
import { OFFICIAL_EVENTS } from "@/data/mock-events";

interface EventPageProps {
  params: Promise<{ id: string }>;
}

/** Student events have uuid ids and are resolved on the client after sign-in. */
const STUDENT_EVENT_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function generateStaticParams() {
  return OFFICIAL_EVENTS.map((event) => ({ id: event.id }));
}

export async function generateMetadata({ params }: EventPageProps): Promise<Metadata> {
  const { id } = await params;
  const event = OFFICIAL_EVENTS.find((e) => e.id === id);
  if (!event) return {};
  return {
    title: `${event.title} at ${event.locationName} — Campus Connect`,
    description: event.description,
  };
}

export default async function EventPage({ params }: EventPageProps) {
  const { id } = await params;
  if (!OFFICIAL_EVENTS.some((event) => event.id === id) && !STUDENT_EVENT_ID.test(id)) notFound();
  return <CampusApp initialEventId={id} />;
}
