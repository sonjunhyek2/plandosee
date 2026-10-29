"use client";

import DiaryApp from "@/components/DiaryApp";
import { getSeoulDateString } from "@plandosee/shared/date-seoul";

export default function HomePage() {
  return <DiaryApp serverSeoulToday={getSeoulDateString(new Date())} />;
}

