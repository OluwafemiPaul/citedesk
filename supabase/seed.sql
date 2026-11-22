-- Sample business for new installs (FRD F13.4). Safe to run more than once.
-- Shows a working help page at /help/sample-bakery with articles. It has no AI key,
-- so its chat stays offline until you sign in as its owner and connect one.
do $$
declare acc uuid; b uuid;
begin
  select id into acc from accounts where contact_email = 'owner@sample-bakery.example';
  if acc is null then
    insert into accounts (name, website, business_type, contact_name, contact_email, status, approved_at)
    values ('Sample Bakery (demo)', null, 'Food and drink', 'Sample Owner', 'owner@sample-bakery.example', 'approved', now())
    returning id into acc;
  end if;
  select id into b from bots where account_id = acc;
  if b is null then
    insert into bots (account_id, name, welcome_message, brand_color, slug, handoff_email, hours_note, setup_step)
    values (acc, 'Sample Bakery helper', 'Hi! Ask me about our hours, menu, cakes or delivery.', '#9a3412', 'sample-bakery', 'owner@sample-bakery.example', 'We reply within one business day.', 6)
    returning id into b;
  end if;
  if not exists (select 1 from articles where bot_id = b) then
    insert into articles (account_id, bot_id, title, body, source, status)
    select acc, b, t.title, t.body, 'manual', 'approved'
    from (values
    ('About Sample Bakery', 'Sample Bakery is a small family bakery at 214 Maple Street, Springfield. We bake bread, pastries and celebration cakes fresh every morning, using local flour and eggs. This is a fictional sample business that ships with CiteDesk.'),
    ('Opening Hours', 'We are open Tuesday to Friday from 7am to 6pm, Saturday from 8am to 4pm, and Sunday from 9am to 1pm. We are closed on Mondays.

We are also closed on Thanksgiving Day, Christmas Day and New Year''s Day. On Christmas Eve we close early, at 2pm.'),
    ('Menu and Prices', 'Prices below include tax.

• Sourdough loaf: $8.

• Whole wheat sandwich loaf: $6.

• Butter croissant: $3.50.

• Chocolate croissant: $4.

• Cinnamon roll: $4.50.

• Blueberry muffin: $3.

• Dozen assorted cookies: $18.

• 8 inch celebration cake (serves 10 to 12): from $45.'),
    ('Custom Cakes', 'Custom celebration cakes must be ordered at least 5 days ahead. A 50% deposit is due when you order, and the rest is due at pickup.

We can write a message on any cake for free. Photo printed cakes cost an extra $10. Tiered cakes for large events need a consultation with our head baker, which you can book by phone.'),
    ('Ordering and Pickup', 'You can order by phone, in the shop, or through the order form on our website. Orders placed before 2pm are ready for pickup the next day after 10am.

Pickup is at the front counter. Please bring your order number or the name on the order. Orders not collected by closing time the day after pickup are donated to the Springfield food bank.'),
    ('Delivery', 'We deliver within 8 miles of the shop, Tuesday to Saturday between 10am and 3pm. Delivery costs $6 and is free for orders over $60.

We do not deliver on Sundays. Custom cakes can be delivered for a flat fee of $15 because they need extra care in transport.'),
    ('Allergies and Dietary Needs', 'All our products are made in one kitchen that handles wheat, eggs, milk, soy, peanuts and tree nuts, so we cannot guarantee any item is free from allergens.

We bake a gluten free bread on Wednesdays and Saturdays only, and it sells out early, so please order ahead. Vegan options change every week; ask staff or call us to hear this week''s choices.

If you have a severe allergy, please speak to a member of staff before ordering.'),
    ('Payment', 'We accept all major credit and debit cards, Apple Pay, Google Pay and cash. We do not accept checks. Gift cards are sold in the shop from $10 to $100 and never expire.'),
    ('Refunds and Cancellations', 'You can cancel a custom cake up to 72 hours before pickup for a full refund of your deposit. Cancellations made later than that keep the deposit, because we have already bought ingredients.

If something you bought is not right, tell us within 24 hours with a photo and your receipt, and we will replace it or refund you. Fresh bread and pastries cannot be returned for change of mind.'),
    ('Catering', 'We cater breakfasts and lunches for offices and events of 10 to 150 people. Catering menus start at $12 per person and need at least 3 days notice.'),
    ('Contact Us', 'Phone: 555 0142, during opening hours.

Email: hello@samplebakery.example. We reply within one business day.

Address: 214 Maple Street, Springfield. Free parking is behind the shop.')
    ) as t(title, body);
    insert into chunks (article_id, bot_id, ord, text)
    select id, bot_id, 0, title || E'\n' || body from articles where bot_id = b;
  end if;
end $$;
