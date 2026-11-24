--
-- PostgreSQL database dump (fixture: the tables the cinema-context extract reads, and one it skips)
--

COPY public.editor_person (id, name) FROM stdin;
1	Iemand
\.

COPY public.editor_address (id, address_id, street_name, city_name, geodata, "order") FROM stdin;
1	A1	Ceintuurbaan 338	Amsterdam	52.355, 4.899	\N
2	A2	Coolsingel 1	Rotterdam	51.92, 4.48	\N
3	A3	Kalverstraat 1	Amsterdam	\N	\N
\.

COPY public.editor_venue (id, venue_id, name, venue_type, address_id, perm_id) FROM stdin;
1	VE1	Rialto	Cinema	1	B000001
2	VE2	Luxor	Cinema	2	B000002
3	VE3	Passage	Theatre	3	B000003
\.

COPY public.editor_film (id, film_id, title, film_year, country, production_company, film_director, perm_id) FROM stdin;
1	FI1	Skippy	1931	US	Paramount	Norman Taurog	F000001
2	FI2	Can-can	1960	US	Pathé\\Frères	\N	F000002
\.

COPY public.editor_filmtitlevariation (id, film_variation_id, film_id, title, film_reference_id) FROM stdin;
1	FV1	FI2	Can Can (NL)	2
\.

COPY public.editor_programme (id, programme_id, programme_date, perm_id, venue_reference_id) FROM stdin;
1	P1	1934-01-05	V000001	1
2	P2	1934-01-06	V000002	2
3	P3	1934-01-07	V000003	3
4	P4	1934-02	\N	1
\.

COPY public.editor_programmeitem (id, programme_item_id, "order", live_performance, film_reference_id, film_variation_reference_id, programme_reference_id) FROM stdin;
10	I10	2	\N	1	\N	1
11	I11	1	Mello Wendini,\nkomisch dressuur act	\N	\N	1
12	I12	3	\N	\N	1	1
13	I13	4	\N	\N	\N	1
14	I14	1	\N	1	\N	2
15	I15	\N	\N	2	\N	4
\.

