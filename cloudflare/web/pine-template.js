export const pineTemplate = String.raw`//@version=6
indicator('定制支撑与压力位区间', overlay = true, max_boxes_count = 500, max_labels_count = 500, max_lines_count = 50)

// =========================================================================
// 🎛️ 面板配置区
// =========================================================================
grp_style = '🎨 全局样式配置'
in_bg_color = input.color(color.new(color.gray, 85), title = '默认通道底色', group = grp_style)
in_line_color = input.color(color.black, title = '默认线条颜色', group = grp_style)
in_label_bg = input.color(color.yellow, title = '仅显示文字时的文本框底色', group = grp_style)

grp_toggle = '👁️ 可见范围及显示开关'
in_show_lines = input.bool(true, title = '展示平行线 (框)', group = grp_toggle)
in_show_text = input.bool(true, title = '展示说明文字', group = grp_toggle)
in_filter_dist = input.bool(true, title = '只显示现价附近区间 (距离过滤)', group = grp_toggle)
in_max_dist = input.float(30.0, title = '距离过滤 ±%', minval = 1.0, maxval = 300.0, step = 5.0, group = grp_toggle)

grp_val = '📈 前瞻估值卡'
in_show_val = input.bool(true, title = '显示估值卡', group = grp_val)
in_val_pos = input.string('右上', title = '卡片位置', options = ['右上', '右下', '左上', '左下'], group = grp_val)

// =========================================================================
// ⚙️ 系统函数区
// =========================================================================
val_pos() =>
    switch in_val_pos
        '右下' => position.bottom_right
        '左上' => position.top_left
        '左下' => position.bottom_left
        => position.top_right

draw_zone(string tickers, float price_a, float price_b, string label_text, color custom_bg = na, color custom_line = na) =>

    float top = math.max(price_a, price_b)
    float bottom = math.min(price_a, price_b)
    color final_bg = na(custom_bg) ? in_bg_color : custom_bg
    color final_line = na(custom_line) ? in_line_color : custom_line

    bool is_target = false
    array<string> ticker_arr = str.split(tickers, ',')
    for t in ticker_arr
        if str.trim(t) == syminfo.ticker
            is_target := true
            break

    // 距离过滤：区间与现价 ±X% 的范围不相交就不画，避免区间太多把缩放锁死
    float dist = in_max_dist / 100.0
    bool near_price = bottom <= close * (1 + dist) and top >= close * (1 - dist)

    if is_target and barstate.islast and (not in_filter_dist or near_price)

        // 1. 如果开启了平行线，画纯净的框（不包含文字，避免文字飞出屏幕）
        if in_show_lines
            box.new(left = bar_index[1], top = top, right = bar_index, bottom = bottom, border_color = final_line, border_width = 1, bgcolor = final_bg, extend = extend.both)

        // 2. 如果开启了说明文字，专门用 label 把文字固定在最新K线的右侧
        if in_show_text
            // 智能底色：如果有平行线，文字背景就完全透明(100)；如果没有平行线，就用面板里的黄色
            color lbl_bg = in_show_lines ? color.new(color.white, 100) : in_label_bg

            label.new(x = bar_index, y = (top + bottom) / 2, text = label_text, color = lbl_bg, textcolor = color.black, style = label.style_label_left, size = size.normal)

    int dummy = 0
    dummy

// 前瞻估值卡：draw_valuation 只负责收集文本（Pine 函数里不能建表），
// 收集结果在数据区之后的全局代码里统一渲染成表格
// val_lines 与 val_is_title 一一对应：true=标的标题行，false=估值明细行
var array<string> val_lines = array.new<string>()
var array<bool> val_is_title = array.new<bool>()

// 参数：标的, 卡片标题(如 '30-40倍 高倍参考'), 估值明细行(用 \n 分隔，行数不限)
// 中位数由导出方算好后直接写在明细行里，脚本只负责显示
draw_valuation(string tickers, string title, string lines) =>

    bool is_target = false
    array<string> ticker_arr = str.split(tickers, ',')
    for t in ticker_arr
        if str.trim(t) == syminfo.ticker
            is_target := true
            break

    if is_target and barstate.islast and in_show_val
        val_is_title.push(true)
        val_lines.push(title)
        array<string> rows = str.split(lines, '\n')
        for row in rows
            if str.trim(row) != ''
                val_is_title.push(false)
                val_lines.push(row)

    int dummy = 0
    dummy

// =========================================================================
// 📝 数据配置区
// =========================================================================
draw_cta_level(float price, string caption, string note, color tint, bool dashed) =>
    var line level_line = line.new(
         bar_index, price, bar_index + 1, price,
         extend = extend.both, color = tint,
         style = dashed ? line.style_dashed : line.style_solid, width = 2)

    var label level_label = label.new(
         bar_index + 1, price, caption,
         style = label.style_label_left, color = tint,
         textcolor = color.white, size = size.small,
         textalign = text.align_left, tooltip = note)

    label.set_x(level_label, bar_index + 1)

// EXPORT_DATA

// =========================================================================
// 🪟 估值卡渲染（必须放在数据区之后：先收集文本，再在末根K线统一画表）
// =========================================================================
if barstate.islast and in_show_val and val_lines.size() > 0
    val_tbl = table.new(val_pos(), 1, val_lines.size(), bgcolor = color.new(color.white, 15), border_color = color.gray, border_width = 1)
    for i = 0 to val_lines.size() - 1
        table.cell(val_tbl, 0, i, val_lines.get(i), text_size = size.small, text_color = color.black, bgcolor = val_is_title.get(i) ? in_label_bg : color(na))
`;
