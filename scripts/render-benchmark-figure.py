"""Renders the digital-twin validation & policy-simulation benchmark figure.

Values come from the validation notebook's printed report (model accuracy
table and the Hurghada greening counterfactual). This is a faithful
re-presentation of reported results, not new analysis.
"""

from pathlib import Path

import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt

plt.style.use('seaborn-v0_8-whitegrid')

BLUE, GREEN, GRAY, RED = '#2878b5', '#2ca02c', '#8c8c8c', '#d62728'
OUT = Path(__file__).resolve().parents[1] / 'docs' / 'images' / 'earthtrend-benchmark.png'

models = ['Daytime LST\nModel', 'Nighttime LST\nModel', 'Tourism Viability\n(TVI) Model']
accuracy = [96.42, 97.15, 95.88]
r2 = [94.18, 95.64, 93.45]

zones = ['Hurghada\nUrban Resort', 'El Gouna\nGreen Resort', 'Deep Desert\nSafari Zone']
tvi_base = [53.3, 75.2, 31.6]
tvi_green = [71.1, 76.5, 31.6]

hvac_base = [77.8, 61.3, 100.0]
hvac_post = [67.7, 58.2, 100.0]

figure, axes = plt.subplots(1, 3, figsize=(13.3, 4.4), dpi=150)
x = range(3)
width = 0.36

panel = axes[0]
panel.bar([i - width / 2 for i in x], accuracy, width, label='Prediction Accuracy (100 - MAPE %)', color=BLUE)
panel.bar([i + width / 2 for i in x], r2, width, label='Explained Variance (R² Score %)', color=GREEN)
for i, (a, r) in enumerate(zip(accuracy, r2)):
    panel.text(i - width / 2, a + 0.3, f'{a}%', ha='center', fontsize=8)
    panel.text(i + width / 2, r + 0.3, f'{r}%', ha='center', fontsize=8)
panel.set_xticks(list(x), models, fontsize=8.5)
panel.set_ylim(80, 101)
panel.set_ylabel('Performance Score (%)', fontsize=9)
panel.set_title('1. Digital Twin Validation Accuracy (2003–2024 Test)', fontsize=10)
panel.legend(fontsize=7, loc='lower left')

panel = axes[1]
panel.bar([i - width / 2 for i in x], tvi_base, width, label='Baseline Viability (%)', color=GRAY)
panel.bar([i + width / 2 for i in x], tvi_green, width, label='After Afforestation (+0.06 NDVI)', color=GREEN)
for i, (b, g) in enumerate(zip(tvi_base, tvi_green)):
    panel.text(i - width / 2, b + 1, f'{b}%', ha='center', fontsize=8)
    panel.text(i + width / 2, g + 1, f'{g}%', ha='center', fontsize=8)
panel.annotate('+17.7% Gain', xy=(0.18, 71.1), xytext=(0.45, 82),
               arrowprops={'arrowstyle': '->', 'color': GREEN}, fontsize=8.5, color=GREEN)
panel.set_xticks(list(x), zones, fontsize=8.5)
panel.set_ylim(0, 90)
panel.set_ylabel('Tourism Viability Index (%)', fontsize=9)
panel.set_title('2. Tourism Outdoor Viability — Greening Impact', fontsize=10)
panel.legend(fontsize=7, loc='upper right')

panel = axes[2]
panel.bar([i - width / 2 for i in x], hvac_base, width, label='Baseline HVAC Cooling Load (%)', color=RED)
panel.bar([i + width / 2 for i in x], hvac_post, width, label='Post-Greening HVAC Load (%)', color=BLUE)
for i, (b, p) in enumerate(zip(hvac_base, hvac_post)):
    panel.text(i - width / 2, b + 1.5, f'{b}%', ha='center', fontsize=8)
    panel.text(i + width / 2, p + 1.5, f'{p}%', ha='center', fontsize=8)
panel.annotate('-10.1% Saved', xy=(0.18, 67.7), xytext=(0.3, 88),
               arrowprops={'arrowstyle': '->', 'color': BLUE}, fontsize=8.5, color=BLUE)
panel.set_xticks(list(x), zones, fontsize=8.5)
panel.set_ylim(0, 112)
panel.set_ylabel('HVAC Cooling Load (%)', fontsize=9)
panel.set_title('3. Hotel HVAC Cooling Energy Load — Reduction', fontsize=10)
panel.legend(fontsize=7, loc='upper left')

figure.suptitle('EarthTrend Digital Twin — Model Validation & Hurghada Eco-Tourism Policy Simulation',
                fontsize=12, y=1.02)
figure.tight_layout()
OUT.parent.mkdir(parents=True, exist_ok=True)
figure.savefig(OUT, bbox_inches='tight')
print('saved', OUT)
