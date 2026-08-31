import { useEffect, useState } from "react";

/** Poucas rotas não valem um roteador: `/`, `/aprender`, `/room/:code`, `/mock`. */
export type Route =
  | { name: "home" }
  | { name: "room"; code: string }
  | { name: "mock" }
  | { name: "tutorial" };

function parse(pathname: string): Route {
  if (/^\/mock\/?$/.test(pathname)) return { name: "mock" };
  if (/^\/aprender\/?$/.test(pathname)) return { name: "tutorial" };
  const match = /^\/room\/([A-Za-z0-9]+)\/?$/.exec(pathname);
  return match ? { name: "room", code: match[1].toUpperCase() } : { name: "home" };
}

export function navigate(path: string) {
  history.pushState({}, "", path);
  dispatchEvent(new PopStateEvent("popstate"));
}

export function useRoute(): Route {
  const [route, setRoute] = useState(() => parse(location.pathname));

  useEffect(() => {
    const update = () => setRoute(parse(location.pathname));
    addEventListener("popstate", update);
    return () => removeEventListener("popstate", update);
  }, []);

  return route;
}

export const roomUrl = (code: string) => `${location.origin}/room/${code}`;
