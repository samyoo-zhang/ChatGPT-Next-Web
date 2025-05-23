function getContainerElement(target: any, id: string): any {
  const parentNode = target.parentNode;
  if (parentNode?.className === "markdown-body") {
    return parentNode.querySelector(`#${id}`);
  }
  return parentNode ? getContainerElement(parentNode, id) : null;
}

export function scrollTargetElement(target: HTMLAnchorElement) {
  const id = target.href?.split("#")[1];
  const element = getContainerElement(target, id);
  element.scrollIntoView();
}
