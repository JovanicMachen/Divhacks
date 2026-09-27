import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { CampusApp } from "@/components/CampusApp";
import { OFFICIAL_EVENTS } from "@/data/mock-events";
import { isRoutableEventId } from "@/lib/event-ids";

interface EventPageProps {
  params: Promise<{ id: string }>;
}

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
  if (!isRoutableEventId(id)) notFound();
  return <CampusApp initialEventId={id} />;
}
