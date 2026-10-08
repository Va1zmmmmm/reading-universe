if (window.parent !== window && window.parent.__readingViews) {
  window.GRAPH = window.parent.__readingViews.graph;
  window.UNIVERSE = window.parent.__readingViews.universe;
} else {
  document.write('<script src="graph_data.js"><\/script>');
}
