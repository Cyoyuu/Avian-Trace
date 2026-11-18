import { createFilterStore } from "./filters/filter-store.js";
import { TASK_DEFINITIONS } from "./filters/filter-definitions.js";
import { createFilterHeader } from "./components/filter-header.js";

const store = createFilterStore();
const options = {
  stateCode: [
    { value: "US-MA", label: "Massachusetts" },
    { value: "US-NY", label: "New York" }
  ],
  countyCode: [
    { value: "US-MA-017", label: "Middlesex County" },
    { value: "US-MA-025", label: "Suffolk County, MA" },
    { value: "US-NY-061", label: "New York County" },
    { value: "US-NY-103", label: "Suffolk County, NY" }
  ],
  taxonId: [
    { value: "avibase-4E74AE22", label: "Northern Cardinal" },
    { value: "avibase-00AF5DA1", label: "House Sparrow" }
  ]
};
// Initialize before subscriptions; initial rendering is explicit, not a change event.
store.setShared({ stateCode: "US-MA", countyCode: "US-MA-017" });
const taskSelect = document.querySelector("#task");
const counts = Object.fromEntries(Object.keys(TASK_DEFINITIONS).map(id => [id, 0]));
const snapshots = new Map();
Object.entries(TASK_DEFINITIONS).forEach(([id, task]) => {
  const panel = document.createElement("div");
  const title = document.createElement("h3");
  const output = document.createElement("pre");
  title.textContent = id.toUpperCase() + " — " + task.label;
  panel.append(title, output);
  document.querySelector("#snapshots").append(panel);
  snapshots.set(id, output);
});

function renderSnapshots() {
  snapshots.forEach((output, id) => { output.textContent = JSON.stringify(store.getFilters(id), null, 2); });
  document.querySelector("#counts").textContent = Object.entries(counts)
    .map(([id, count]) => id.toUpperCase() + ": " + count).join(" · ");
}

function subscribeTask(id) {
  return store.subscribe({ chartId: id }, ({ changedKeys }) => {
    counts[id] += 1;
    const item = document.createElement("li");
    item.textContent = id.toUpperCase() + " notified: " + changedKeys.join(", ");
    const log = document.querySelector("#notifications");
    log.prepend(item);
    if (log.children.length > 20) log.lastElementChild.remove();
    renderSnapshots();
  });
}
const subscriptions = new Map(Object.keys(TASK_DEFINITIONS).map(id => [id, subscribeTask(id)]));
let t3Subscribed = true;
const toggleT3 = document.querySelector("#toggle-t3");
function toggleSubscription() {
  if (t3Subscribed) {
    subscriptions.get("t3")();
    subscriptions.delete("t3");
  } else {
    subscriptions.set("t3", subscribeTask("t3"));
  }
  t3Subscribed = !t3Subscribed;
  toggleT3.textContent = t3Subscribed ? "Unsubscribe T3" : "Resubscribe T3";
  toggleT3.setAttribute("aria-pressed", String(!t3Subscribed));
}
toggleT3.addEventListener("click", toggleSubscription);

let header;
function renderHeader() {
  header?.destroy();
  header = createFilterHeader({ container: "#filter-controls", store, chartId: taskSelect.value, options });
  const notes = {
    t1: "State defines the comparison; county highlights one entry within that state's comparison.",
    t2: "Species and years are shared with T3. Season affects T2 only.",
    t3: "State narrows the county choices. Species and years are shared with T2.",
    t4: "Locations per combination is exactly 3, 4, or 5. Richness counts distinct species across the union of the combination's locations."
  };
  document.querySelector("#task-note").textContent = notes[taskSelect.value];
}
taskSelect.addEventListener("change", renderHeader);
renderHeader();
renderSnapshots();
window.addEventListener("pagehide", () => {
  header.destroy();
  subscriptions.forEach(unsubscribe => unsubscribe());
  taskSelect.removeEventListener("change", renderHeader);
  toggleT3.removeEventListener("click", toggleSubscription);
}, { once: true });
